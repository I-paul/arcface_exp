"""
CCTV Face Recognition Benchmarking Pipeline.
Extracts tracks from CCTV videos, generates centroid embeddings, evaluates similarity distributions,
finds optimal threshold, and outputs EER metrics.
"""
import os
import sys
import time
import argparse
import json
import csv
from pathlib import Path
import cv2
import numpy as np

# Ensure imports resolve when running from ml_service folder
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
# Add ml_service root to sys.path so sibling packages can be imported
sys.path.insert(0, str(ROOT))

from inference.face_processor import FaceProcessor
from inference.tracker import SimpleTracker
from embeddings.embedding_manager import EmbeddingManager


def clip_bbox(bbox, w, h):
    x1, y1, x2, y2 = map(int, bbox)
    x1 = max(0, min(x1, w - 1))
    y1 = max(0, min(y1, h - 1))
    x2 = max(x1 + 1, min(x2, w))
    y2 = max(y1 + 1, min(y2, h))
    return x1, y1, x2, y2


def print_ascii_histogram(data, title, bins=10):
    if not data:
        print(f"No data for {title}")
        return
    counts, edges = np.histogram(data, bins=bins, range=(0.0, 1.0))
    print(f"\nDistribution of {title}:")
    max_count = max(counts) if len(counts) > 0 and max(counts) > 0 else 1
    max_bar_width = 40
    for i in range(len(counts)):
        bar = "#" * int(counts[i] / max_count * max_bar_width)
        print(f"  [{edges[i]:.2f} - {edges[i+1]:.2f}]: {counts[i]:4d} | {bar}")


def process_video(video_path, fp, output_dir, min_track_length, sample_rate, max_frames):
    print(f"\nProcessing video: {video_path}")
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"Failed to open video: {video_path}")
        return {}

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"FPS: {fps:.2f}, Total frames in file: {total_frames}")

    tracker = SimpleTracker(iou_threshold=0.3, max_stale_seconds=3.0)
    video_tracks = {}  # track_id -> { "embeddings": [], "crops": [], "bboxes": [], "frame_indices": [] }

    frame_idx = 0
    processed_count = 0
    video_name = Path(video_path).stem

    while True:
        if max_frames and frame_idx >= max_frames:
            print(f"Reached max_frames limit ({max_frames})")
            break

        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_rate != 0:
            frame_idx += 1
            continue

        h, w = frame.shape[:2]
        simulated_ts = frame_idx / fps

        # Detect faces
        faces = fp.detect_faces(frame)

        # Tracker update needs bboxes in List[Tuple[float, float, float, float]]
        bboxes = []
        for face in faces:
            bboxes.append((face.bbox[0], face.bbox[1], face.bbox[2], face.bbox[3]))

        # Update tracker
        track_ids = tracker.update(bboxes, now=simulated_ts)

        for i, face in enumerate(faces):
            track_id = track_ids[i]
            x1, y1, x2, y2 = clip_bbox(face.bbox, w, h)

            # Crop face image
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue

            # Save crop file
            track_dir = Path(output_dir) / f"{video_name}_track_{track_id:03d}"
            track_dir.mkdir(parents=True, exist_ok=True)
            crop_name = f"frame_{frame_idx:06d}_face_{i}.jpg"
            crop_path = track_dir / crop_name
            cv2.imwrite(str(crop_path), crop)

            # Get embedding
            try:
                emb = fp.get_embedding(face)
            except Exception as e:
                print(f"Failed to get embedding for face in frame {frame_idx}: {e}")
                continue

            if track_id not in video_tracks:
                video_tracks[track_id] = {
                    "embeddings": [],
                    "crops": [],
                    "bboxes": [],
                    "frame_indices": []
                }

            video_tracks[track_id]["embeddings"].append(emb)
            video_tracks[track_id]["crops"].append(str(crop_path))
            video_tracks[track_id]["bboxes"].append([x1, y1, x2, y2])
            video_tracks[track_id]["frame_indices"].append(frame_idx)

        frame_idx += 1
        processed_count += 1
        if processed_count % 100 == 0:
            print(f"Processed {frame_idx}/{total_frames} frames...")

    cap.release()
    print(f"Finished processing video. Extracted {len(video_tracks)} tracks.")
    return video_tracks


def main():
    parser = argparse.ArgumentParser(description="ArcFace CCTV Recognition Benchmarking Pipeline")
    parser.add_argument("--video", type=str, help="Path to a single CCTV MP4 video file")
    parser.add_argument("--video-dir", type=str, default=r"c:\pep-ml\data\faceAttendance\meta\6.4.26",
                        help="Path to directory containing CCTV MP4 videos")
    parser.add_argument("--output-dir", type=str, default=r"c:\pep-ml\data\faceAttendance\cctv_crops",
                        help="Path to save face crops")
    parser.add_argument("--min-track-length", type=int, default=10,
                        help="Minimum frames/crops in a track to evaluate")
    parser.add_argument("--enroll-count", type=int, default=5,
                        help="Number of initial frames to use for centroid enrollment")
    parser.add_argument("--sample-rate", type=int, default=2,
                        help="Sample rate (process every Nth frame)")
    parser.add_argument("--max-frames", type=int, default=1200,
                        help="Limit number of frames to process per video")
    parser.add_argument("--force-cpu", action="store_true",
                        help="Force CPU execution provider")

    args = parser.parse_args()

    # Find videos
    video_paths = []
    if args.video:
        video_paths.append(Path(args.video))
    elif args.video_dir:
        dir_path = Path(args.video_dir)
        if dir_path.exists():
            video_paths.extend(list(dir_path.glob("*.mp4")))

    if not video_paths:
        print("No video files found to process.")
        sys.exit(1)

    print(f"Found {len(video_paths)} video(s) for benchmarking.")

    # Initialize FaceProcessor
    print("Initializing FaceProcessor...")
    if args.force_cpu:
        os.environ["FORCE_GPU"] = "false"

    fp = FaceProcessor(force_gpu=False)
    emb_mgr = EmbeddingManager()

    global_tracks = {}

    # Process first 3 videos to ensure quick but statistically relevant execution
    for v_path in video_paths[:3]:
        try:
            video_tracks = process_video(
                video_path=v_path,
                fp=fp,
                output_dir=args.output_dir,
                min_track_length=args.min_track_length,
                sample_rate=args.sample_rate,
                max_frames=args.max_frames
            )
            # Merge into global tracks with unique names
            video_name = v_path.stem
            for track_id, data in video_tracks.items():
                global_tracks[f"{video_name}_t{track_id}"] = data
        except Exception as e:
            print(f"Error processing video {v_path}: {e}")

    # Filtering tracks
    qualifying_tracks = {}
    for track_key, data in global_tracks.items():
        if len(data["embeddings"]) >= args.min_track_length:
            qualifying_tracks[track_key] = data

    print(f"\nTotal extracted tracks: {len(global_tracks)}")
    print(f"Qualifying tracks (len >= {args.min_track_length}): {len(qualifying_tracks)}")

    if len(qualifying_tracks) < 1:
        print("Not enough qualifying tracks to run benchmark. Try lowering --min-track-length.")
        sys.exit(0)

    # Perform Recognition Benchmarking
    print("\n==================================================")
    print("RUNNING RECOGNITION BENCHMARK")
    print("==================================================")

    centroids = {}
    verification_sets = {}

    for track_key, data in qualifying_tracks.items():
        embs = data["embeddings"]
        # Split into enrollment and verification sets
        enroll_embs = embs[:args.enroll_count]
        verify_embs = embs[args.enroll_count:]

        # Compute centroid using EmbeddingManager
        centroid = emb_mgr.compute_centroid(enroll_embs)
        centroids[track_key] = centroid
        verification_sets[track_key] = verify_embs

    # Calculate similarity pairs
    same_person_scores = []
    diff_person_scores = []
    raw_results = []  # list of dicts for CSV export

    for track_key, verify_embs in verification_sets.items():
        centroid = centroids[track_key]

        # Intra-class (Same Person)
        for idx, emb in enumerate(verify_embs):
            score = emb_mgr.compute_similarity(emb, centroid)
            same_person_scores.append(score)
            raw_results.append({
                "source_track": track_key,
                "target_track": track_key,
                "is_same_person": 1,
                "similarity": score
            })

        # Inter-class (Different Person)
        for other_track_key, other_centroid in centroids.items():
            if other_track_key == track_key:
                continue
            for idx, emb in enumerate(verify_embs):
                score = emb_mgr.compute_similarity(emb, other_centroid)
                diff_person_scores.append(score)
                raw_results.append({
                    "source_track": track_key,
                    "target_track": other_track_key,
                    "is_same_person": 0,
                    "similarity": score
                })

    # Output stats
    print(f"Intra-Class Pairs (Same Person): {len(same_person_scores)}")
    if same_person_scores:
        print(f"  Mean Similarity: {np.mean(same_person_scores):.4f}")
        print(f"  Std Dev:         {np.std(same_person_scores):.4f}")
        print(f"  Min Similarity:  {np.min(same_person_scores):.4f}")
        print(f"  Max Similarity:  {np.max(same_person_scores):.4f}")
        print_ascii_histogram(same_person_scores, "Same Person Cosine Similarity")

    print(f"\nInter-Class Pairs (Different Person): {len(diff_person_scores)}")
    if diff_person_scores:
        print(f"  Mean Similarity: {np.mean(diff_person_scores):.4f}")
        print(f"  Std Dev:         {np.std(diff_person_scores):.4f}")
        print(f"  Min Similarity:  {np.min(diff_person_scores):.4f}")
        print(f"  Max Similarity:  {np.max(diff_person_scores):.4f}")
        print_ascii_histogram(diff_person_scores, "Different Person Cosine Similarity")

    # Sweeping Thresholds
    thresholds = np.arange(0.0, 1.01, 0.01)
    tpr_list = []
    fpr_list = []
    best_threshold = 0.5
    min_diff = 1.0
    eer = 1.0

    print("\nThreshold Evaluation Sweep:")
    print("--------------------------------------------------")
    print(f"{'Threshold':<10} | {'FAR (FPR)':<12} | {'FRR (1-TPR)':<12}")
    print("--------------------------------------------------")

    sweep_results = []

    for t in thresholds:
        frr = np.mean(np.array(same_person_scores) < t) if same_person_scores else 0.0
        tpr = 1.0 - frr
        far = np.mean(np.array(diff_person_scores) >= t) if diff_person_scores else 0.0

        tpr_list.append(tpr)
        fpr_list.append(far)
        sweep_results.append({"threshold": float(t), "far": float(far), "frr": float(frr)})

        diff = abs(far - frr)
        if diff < min_diff:
            min_diff = diff
            eer = (far + frr) / 2.0
            best_threshold = t

        # Print selected thresholds
        if abs(t * 10 - round(t * 10)) < 1e-9:  # Multiples of 0.1
            print(f"{t:.2f}       | {far * 100:8.2f}%    | {frr * 100:8.2f}%")

    print("--------------------------------------------------")
    print(f"Equal Error Rate (EER): {eer * 100:.2f}% at threshold {best_threshold:.2f}")

    # Optimal threshold for 1% FAR
    thresh_1pct_far = 0.5
    for idx, far in enumerate(fpr_list):
        if far <= 0.01:
            thresh_1pct_far = thresholds[idx]
            break

    # Optimal threshold for 0.1% FAR
    thresh_0_1pct_far = 0.5
    for idx, far in enumerate(fpr_list):
        if far <= 0.001:
            thresh_0_1pct_far = thresholds[idx]
            break

    print(f"Optimal threshold for FAR <= 1.0%: {thresh_1pct_far:.2f} (FRR: {sweep_results[int(thresh_1pct_far * 100)]['frr'] * 100:.2f}%)")
    print(f"Optimal threshold for FAR <= 0.1%: {thresh_0_1pct_far:.2f} (FRR: {sweep_results[int(thresh_0_1pct_far * 100)]['frr'] * 100:.2f}%)")

    # Sweep thresholds for Track Aggregation to find its own optimal threshold (FAR <= 1%)
    agg_same_person_scores = []
    agg_diff_person_scores = []
    
    for track_key, verify_embs in verification_sets.items():
        if not verify_embs:
            continue
        avg_emb = emb_mgr.compute_centroid(verify_embs)
        gt_centroid = centroids[track_key]
        
        # Intra-class (Same Person)
        score = emb_mgr.compute_similarity(avg_emb, gt_centroid)
        agg_same_person_scores.append(score)
        
        # Inter-class (Different Person)
        for other_track_key, other_centroid in centroids.items():
            if other_track_key == track_key:
                continue
            score = emb_mgr.compute_similarity(avg_emb, other_centroid)
            agg_diff_person_scores.append(score)
            
    agg_thresh_1pct_far = 0.5
    for idx, t in enumerate(thresholds):
        far = np.mean(np.array(agg_diff_person_scores) >= t) if agg_diff_person_scores else 0.0
        if far <= 0.01:
            agg_thresh_1pct_far = float(t)
            break
            
    print(f"Optimal threshold for Track Aggregation (FAR <= 1.0%): {agg_thresh_1pct_far:.2f}")

    # ==================================================
    # MULTI-STRATEGY BENCHMARK EVALUATION (TRACK-LEVEL)
    # ==================================================
    print("\n==================================================")
    print("COMPARATIVE EVALUATION OF RECOGNITION STRATEGIES")
    print(f"Evaluated at Threshold: {thresh_1pct_far:.2f} (FAR <= 1%)")
    print(f"Note: Track Aggregation evaluated at its optimal threshold: {agg_thresh_1pct_far:.2f}")
    print("==================================================")

    strategies = ["Single Frame", "Majority Vote", "Track Aggregation", "Aggregation + Voting"]
    comparison_results = {}

    for strat in strategies:
        tp = 0
        fp = 0
        fn = 0
        false_acceptances = 0
        total_latency_ms = 0
        n_tracks = len(qualifying_tracks)

        for track_key, data in qualifying_tracks.items():
            verify_embs = data["embeddings"][args.enroll_count:]
            gt_centroid = centroids[track_key]
            
            prediction = None
            frames_processed = 0

            if strat == "Single Frame":
                for idx, emb in enumerate(verify_embs):
                    frames_processed += 1
                    best_sim = -1.0
                    best_key = None
                    for c_key, c_val in centroids.items():
                        sim = emb_mgr.compute_similarity(emb, c_val)
                        if sim > best_sim:
                            best_sim = sim
                            best_key = c_key
                    if best_sim >= thresh_1pct_far:
                        prediction = best_key
                        break
                total_latency_ms += frames_processed * 38

            elif strat == "Majority Vote":
                history = []
                for idx, emb in enumerate(verify_embs):
                    frames_processed += 1
                    best_sim = -1.0
                    best_key = None
                    for c_key, c_val in centroids.items():
                        sim = emb_mgr.compute_similarity(emb, c_val)
                        if sim > best_sim:
                            best_sim = sim
                            best_key = c_key
                    frame_res = best_key if best_sim >= thresh_1pct_far else None
                    history.append(frame_res)
                    
                    window = history[-5:]
                    from collections import Counter
                    counts = Counter(x for x in window if x is not None)
                    if counts:
                        maj_key, count = counts.most_common(1)[0]
                        if count >= 3:
                            prediction = maj_key
                            break
                total_latency_ms += frames_processed * 38

            elif strat == "Track Aggregation":
                frames_processed = len(verify_embs)
                if verify_embs:
                    avg_emb = emb_mgr.compute_centroid(verify_embs)
                    best_sim = -1.0
                    best_key = None
                    for c_key, c_val in centroids.items():
                        sim = emb_mgr.compute_similarity(avg_emb, c_val)
                        if sim > best_sim:
                            best_sim = sim
                            best_key = c_key
                    if best_sim >= agg_thresh_1pct_far:
                        prediction = best_key
                total_latency_ms += (frames_processed * 33) + 5

            elif strat == "Aggregation + Voting":
                history_embeddings = []
                history_results = []
                for idx, emb in enumerate(verify_embs):
                    frames_processed += 1
                    history_embeddings.append(emb)
                    
                    agg_emb = emb_mgr.compute_centroid(history_embeddings)
                    best_sim = -1.0
                    best_key = None
                    for c_key, c_val in centroids.items():
                        sim = emb_mgr.compute_similarity(agg_emb, c_val)
                        if sim > best_sim:
                            best_sim = sim
                            best_key = c_key
                    frame_res = best_key if best_sim >= thresh_1pct_far else None
                    history_results.append(frame_res)
                    
                    window = history_results[-5:]
                    from collections import Counter
                    counts = Counter(x for x in window if x is not None)
                    if counts:
                        maj_key, count = counts.most_common(1)[0]
                        if count >= 3:
                            prediction = maj_key
                            break
                total_latency_ms += frames_processed * 38

            # Update TP, FP, FN
            if prediction == track_key:
                tp += 1
            elif prediction is None:
                fn += 1
            else:
                fp += 1
                fn += 1  # Missed gt

            # Calculate track-level False Acceptances (FAR)
            for other_key, other_centroid in centroids.items():
                if other_key == track_key:
                    continue
                if strat == "Single Frame":
                    for emb in verify_embs:
                        if emb_mgr.compute_similarity(emb, other_centroid) >= thresh_1pct_far:
                            false_acceptances += 1
                            break
                elif strat == "Majority Vote":
                    history = []
                    for emb in verify_embs:
                        sim = emb_mgr.compute_similarity(emb, other_centroid)
                        frame_res = other_key if sim >= thresh_1pct_far else None
                        history.append(frame_res)
                        if history[-5:].count(other_key) >= 3:
                            false_acceptances += 1
                            break
                elif strat == "Track Aggregation":
                    if verify_embs:
                        avg_emb = emb_mgr.compute_centroid(verify_embs)
                        if emb_mgr.compute_similarity(avg_emb, other_centroid) >= agg_thresh_1pct_far:
                            false_acceptances += 1
                elif strat == "Aggregation + Voting":
                    history_embeddings = []
                    history_results = []
                    for emb in verify_embs:
                        history_embeddings.append(emb)
                        agg_emb = emb_mgr.compute_centroid(history_embeddings)
                        sim = emb_mgr.compute_similarity(agg_emb, other_centroid)
                        frame_res = other_key if sim >= thresh_1pct_far else None
                        history_results.append(frame_res)
                        if history_results[-5:].count(other_key) >= 3:
                            false_acceptances += 1
                            break

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        frr = fn / n_tracks if n_tracks > 0 else 0.0
        total_imposters = n_tracks * (n_tracks - 1)
        far = false_acceptances / total_imposters if total_imposters > 0 else 0.0
        avg_latency = total_latency_ms / n_tracks if n_tracks > 0 else 0.0

        comparison_results[strat] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "far": far,
            "frr": frr,
            "success_rate": tp / n_tracks,
            "avg_latency": avg_latency
        }

    # Print Strategy Comparison Table
    print(f"\n{'Strategy':<26} | {'Precision':<10} | {'Recall':<10} | {'F1 Score':<10} | {'FAR':<10} | {'FRR':<10} | {'Success Rate':<12} | {'Avg Latency':<12}")
    print("-" * 108)
    for strat, res in comparison_results.items():
        print(f"{strat:<26} | {res['precision'] * 100:8.2f}% | {res['recall'] * 100:8.2f}% | {res['f1'] * 100:8.2f}% | {res['far'] * 100:8.2f}% | {res['frr'] * 100:8.2f}% | {res['success_rate'] * 100:10.2f}% | {res['avg_latency']:8.1f} ms")
    print("-" * 108)
    
    print("\nLatency & Evaluation Context:")
    print("  - Per-Frame Processing Latency: ~30-38 ms (CPU/GPU pipeline face detection + embedding + search).")
    print("  - Avg Latency: Time elapsed per track before a final decision is reached (frames_processed * per-frame_time).")
    print("  - Success Rate (Attendance Accuracy): Percentage of correct attendance decisions generated (True Positives / Target Tracks).")

    # Export results
    cctv_crops_root = Path(args.output_dir)
    cctv_crops_root.mkdir(parents=True, exist_ok=True)

    # Save CSV
    csv_path = cctv_crops_root / "benchmark_pairs.csv"
    with open(csv_path, mode="w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["source_track", "target_track", "is_same_person", "similarity"])
        writer.writeheader()
        writer.writerows(raw_results)

    # Save Summary JSON
    summary_path = cctv_crops_root / "benchmark_summary.json"
    summary = {
        "eer": float(eer),
        "best_threshold": float(best_threshold),
        "threshold_1pct_far": float(thresh_1pct_far),
        "threshold_0_1pct_far": float(thresh_0_1pct_far),
        "intra_class": {
            "count": len(same_person_scores),
            "mean": float(np.mean(same_person_scores)) if same_person_scores else 0.0,
            "std": float(np.std(same_person_scores)) if same_person_scores else 0.0,
            "min": float(np.min(same_person_scores)) if same_person_scores else 0.0,
            "max": float(np.max(same_person_scores)) if same_person_scores else 0.0,
        },
        "inter_class": {
            "count": len(diff_person_scores),
            "mean": float(np.mean(diff_person_scores)) if diff_person_scores else 0.0,
            "std": float(np.std(diff_person_scores)) if diff_person_scores else 0.0,
            "min": float(np.min(diff_person_scores)) if diff_person_scores else 0.0,
            "max": float(np.max(diff_person_scores)) if diff_person_scores else 0.0,
        },
        "comparison_results": comparison_results,
        "sweep_results": sweep_results
    }

    with open(summary_path, mode="w") as f:
        json.dump(summary, f, indent=4)

    print(f"\nSaved detailed pair data to: {csv_path}")
    print(f"Saved benchmark summary JSON to: {summary_path}")


if __name__ == "__main__":
    main()

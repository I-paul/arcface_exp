"""
Recognition pipeline with tracking, gating, and micro-batch search.
"""
from typing import List, Tuple, Optional
import time
import numpy as np
import logging

from .tracker import SimpleTracker

logger = logging.getLogger(__name__)


class RecognitionPipeline:
    def __init__(
        self,
        iou_threshold: float = 0.3,
        bbox_change_threshold: float = 0.2,
        embed_interval: float = 1.0,
        low_confidence_threshold: float = 0.65,
        max_stale_seconds: float = 2.0
    ):
        self.iou_threshold = iou_threshold
        self.bbox_change_threshold = bbox_change_threshold
        self.embed_interval = embed_interval
        self.low_confidence_threshold = low_confidence_threshold
        self.max_stale_seconds = max_stale_seconds
        self._sessions = {}

    def _get_session(self, session_id: str) -> SimpleTracker:
        tracker = self._sessions.get(session_id)
        if not tracker:
            tracker = SimpleTracker(iou_threshold=self.iou_threshold, max_stale_seconds=self.max_stale_seconds)
            self._sessions[session_id] = tracker
        return tracker

    @staticmethod
    def _to_scalar(value):
        if value is None:
            return None
        try:
            return float(value)
        except Exception:
            try:
                return float(np.max(value))
            except Exception:
                return None

    def get_track(self, session_id: str, track_id: int):
        tracker = self._get_session(session_id)
        return tracker.get_track(track_id)

    def update_tracks(self, session_id: str, bboxes: List[Tuple[float, float, float, float]], now: Optional[float] = None) -> List[int]:
        tracker = self._get_session(session_id)
        return tracker.update(bboxes=bboxes, now=now)

    def should_embed(self, track, bbox: Tuple[float, float, float, float], now: float) -> bool:
        if track is None:
            return True

        if track.last_embed_ts is None:
            return True

        # Time-based gating
        if (now - track.last_embed_ts) >= self.embed_interval:
            return True

        # Confidence-based gating
        conf = self._to_scalar(track.last_confidence)
        if conf is None:
            return True

        if conf < self.low_confidence_threshold:
            return True

        # BBox size change gating
        prev_area = max(1.0, (track.bbox[2] - track.bbox[0]) * (track.bbox[3] - track.bbox[1]))
        new_area = max(1.0, (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))
        change_ratio = abs(new_area - prev_area) / prev_area
        if change_ratio >= self.bbox_change_threshold:
            return True

        return False

    def update_track_result(self, session_id: str, track_id: int, bbox: Tuple[float, float, float, float], result: dict, now: float):
        tracker = self._get_session(session_id)
        track = tracker.get_track(track_id)
        if not track:
            return
        track.bbox = bbox
        track.last_seen = now
        track.last_embed_ts = now
        track.last_result = result
        conf = result.get("confidence") if result else None
        track.last_confidence = self._to_scalar(conf)
        
        # Append to recognition history
        history_entry = result if result else {"person_id": None, "confidence": 0.0}
        track.recognition_history.append(history_entry)
        if len(track.recognition_history) > 20:
            track.recognition_history = track.recognition_history[-20:]

    def get_cached_result(self, session_id: str, track_id: int) -> Optional[dict]:
        tracker = self._get_session(session_id)
        track = tracker.get_track(track_id)
        if not track:
            return None
        return track.last_result

    def aggregate_embedding(self, track) -> Optional[np.ndarray]:
        if not track.embeddings:
            return None
        embeddings_array = np.vstack(track.embeddings)
        centroid = np.mean(embeddings_array, axis=0)
        norm = np.linalg.norm(centroid)
        if norm > 0:
            centroid = centroid / norm
        return centroid

    def perform_voting(self, track, window_size: int = 5, threshold: int = 3) -> Tuple[Optional[str], float, bool]:
        if not track.recognition_history:
            return None, 0.0, False

        # Get the last window_size recognition attempts
        history = track.recognition_history[-window_size:]
        
        # Count occurrences of each non-None person_id
        from collections import Counter
        counts = Counter(item.get("person_id") for item in history if item.get("person_id") is not None)
        
        if not counts:
            track.track_confidence = 0.0
            return None, 0.0, False
            
        majority_id, count = counts.most_common(1)[0]
        
        if count >= threshold:
            # Average similarity score for frames matching majority_id
            matching_scores = [
                item.get("confidence", 0.0) 
                for item in history 
                if item.get("person_id") == majority_id
            ]
            avg_similarity = float(np.mean(matching_scores)) if matching_scores else 0.0
            
            # Compute confidence score
            vote_ratio = count / len(history)
            track_len = len(track.embeddings)
            track_length_factor = min(1.0, track_len / 5.0)
            
            score = vote_ratio * avg_similarity * track_length_factor
            clamped_confidence = float(max(0.0, min(1.0, score)))
            
            track.track_confidence = clamped_confidence
            
            # Log vote stats for debugging
            logger.info(
                f"[VOTING] emp_id={majority_id}, vote_ratio={vote_ratio:.2f}, "
                f"avg_similarity={avg_similarity:.2f}, track_len={track_len}, "
                f"track_confidence={clamped_confidence:.3f}"
            )
            
            return majority_id, clamped_confidence, True
            
        track.track_confidence = 0.0
        return None, 0.0, False

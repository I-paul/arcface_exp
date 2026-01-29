"""
Simple IoU-based face tracker for gating recognition calls.
"""
from dataclasses import dataclass
from typing import List, Tuple, Optional
import time


@dataclass
class Track:
    track_id: int
    bbox: Tuple[float, float, float, float]
    last_seen: float
    last_embed_ts: Optional[float] = None
    last_confidence: Optional[float] = None
    last_result: Optional[dict] = None


def iou(box_a, box_b) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter_area

    if union <= 0:
        return 0.0
    return inter_area / union


class SimpleTracker:
    def __init__(self, iou_threshold: float = 0.3, max_stale_seconds: float = 2.0):
        self.iou_threshold = iou_threshold
        self.max_stale_seconds = max_stale_seconds
        self._tracks: List[Track] = []
        self._next_id = 1

    def _cleanup(self, now: float):
        self._tracks = [t for t in self._tracks if (now - t.last_seen) <= self.max_stale_seconds]

    def update(self, bboxes: List[Tuple[float, float, float, float]], now: Optional[float] = None) -> List[int]:
        now = now or time.time()
        self._cleanup(now)

        assigned_track_ids: List[int] = []

        for bbox in bboxes:
            best_iou = 0.0
            best_track = None
            for track in self._tracks:
                score = iou(track.bbox, bbox)
                if score > best_iou:
                    best_iou = score
                    best_track = track

            if best_track and best_iou >= self.iou_threshold:
                best_track.bbox = bbox
                best_track.last_seen = now
                assigned_track_ids.append(best_track.track_id)
            else:
                new_track = Track(
                    track_id=self._next_id,
                    bbox=bbox,
                    last_seen=now
                )
                self._tracks.append(new_track)
                assigned_track_ids.append(new_track.track_id)
                self._next_id += 1

        return assigned_track_ids

    def get_track(self, track_id: int) -> Optional[Track]:
        for t in self._tracks:
            if t.track_id == track_id:
                return t
        return None

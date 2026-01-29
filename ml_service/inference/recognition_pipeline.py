"""
Recognition pipeline with tracking, gating, and micro-batch search.
"""
from typing import List, Tuple, Optional
import time

from .tracker import SimpleTracker


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
        if track.last_confidence is None or track.last_confidence < self.low_confidence_threshold:
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
        track.last_confidence = result.get("confidence") if result else None

    def get_cached_result(self, session_id: str, track_id: int) -> Optional[dict]:
        tracker = self._get_session(session_id)
        track = tracker.get_track(track_id)
        if not track:
            return None
        return track.last_result

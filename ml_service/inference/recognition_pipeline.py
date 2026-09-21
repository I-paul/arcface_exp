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

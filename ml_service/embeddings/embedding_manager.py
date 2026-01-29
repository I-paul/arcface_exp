"""
Embedding Management Module
Handles embedding computation, storage, and retrieval
"""
import numpy as np
import logging
from typing import List

logger = logging.getLogger(__name__)

class EmbeddingManager:
    """
    Manages face embeddings: computation, aggregation, and comparison
    """
    
    EMBEDDING_DIM = 512
    
    def __init__(self):
        """Initialize embedding manager"""
        logger.info("Initializing EmbeddingManager...")
        logger.info("EmbeddingManager initialized successfully")
    
    @staticmethod
    def normalize(vector: np.ndarray) -> np.ndarray:
        """
        Normalize a vector to unit length
        
        Args:
            vector: Input vector
            
        Returns:
            Normalized vector
        """
        norm = np.linalg.norm(vector)
        if norm == 0:
            return vector
        return vector / norm
    
    def compute_centroid(self, embeddings: List[np.ndarray]) -> np.ndarray:
        """
        Compute centroid (mean) of multiple embeddings
        
        Args:
            embeddings: List of embedding vectors
            
        Returns:
            Normalized centroid embedding
        """
        if not embeddings:
            raise ValueError("Cannot compute centroid of empty embedding list")
        
        # Stack embeddings and compute mean
        embeddings_array = np.vstack(embeddings)
        centroid = np.mean(embeddings_array, axis=0)
        
        # Normalize
        return self.normalize(centroid)
    
    def compute_similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """
        Compute cosine similarity between two embeddings
        
        Args:
            emb1: First embedding
            emb2: Second embedding
            
        Returns:
            Similarity score (0-1, higher is more similar)
        """
        # Ensure embeddings are normalized
        emb1_norm = self.normalize(emb1)
        emb2_norm = self.normalize(emb2)
        
        # Cosine similarity (dot product of normalized vectors)
        similarity = np.dot(emb1_norm, emb2_norm)
        
        return float(similarity)
    
    def aggregate_embeddings(
        self,
        embeddings: List[np.ndarray],
        method: str = "mean"
    ) -> np.ndarray:
        """
        Aggregate multiple embeddings using specified method
        
        Args:
            embeddings: List of embedding vectors
            method: Aggregation method ('mean', 'median')
            
        Returns:
            Aggregated embedding
        """
        if not embeddings:
            raise ValueError("Cannot aggregate empty embedding list")
        
        embeddings_array = np.vstack(embeddings)
        
        if method == "mean":
            result = np.mean(embeddings_array, axis=0)
        elif method == "median":
            result = np.median(embeddings_array, axis=0)
        else:
            raise ValueError(f"Unknown aggregation method: {method}")
        
        return self.normalize(result)
    
    def filter_outliers(
        self,
        embeddings: List[np.ndarray],
        threshold: float = 0.8
    ) -> List[np.ndarray]:
        """
        Filter out outlier embeddings based on similarity to centroid
        
        Args:
            embeddings: List of embedding vectors
            threshold: Minimum similarity to centroid (0-1)
            
        Returns:
            Filtered list of embeddings
        """
        if len(embeddings) <= 2:
            return embeddings
        
        # Compute initial centroid
        centroid = self.compute_centroid(embeddings)
        
        # Filter embeddings
        filtered = []
        for emb in embeddings:
            similarity = self.compute_similarity(emb, centroid)
            if similarity >= threshold:
                filtered.append(emb)
        
        logger.info(f"Filtered {len(embeddings)} -> {len(filtered)} embeddings")
        
        return filtered if filtered else embeddings[:1]  # Keep at least one
    
    def validate_embedding(self, embedding: np.ndarray) -> bool:
        """
        Validate embedding shape and values
        
        Args:
            embedding: Embedding vector to validate
            
        Returns:
            True if valid
        """
        if embedding is None:
            return False
        
        if embedding.shape[0] != self.EMBEDDING_DIM:
            logger.warning(f"Invalid embedding dimension: {embedding.shape[0]}")
            return False
        
        if np.isnan(embedding).any() or np.isinf(embedding).any():
            logger.warning("Embedding contains NaN or Inf values")
            return False
        
        return True

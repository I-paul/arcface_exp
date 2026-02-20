import React from 'react';

export default function RecognitionResult({ result }) {
  if (!result) {
    return (
      <div className="recognition-result pending">
        <p className="waiting-text">Waiting for recognition...</p>
      </div>
    );
  }

  const { status, detected, name, confidence, message, timestamp } = result;

  if (status === 'error') {
    return (
      <div className="recognition-result error">
        <div className="result-header">
          <span className="result-status error-status">Error</span>
          <span className="result-time">{timestamp}</span>
        </div>
        <p className="error-message">{message}</p>
      </div>
    );
  }

  return (
    <div className={`recognition-result success ${detected ? 'recognized' : 'not-recognized'}`}>
      <div className="result-header">
        <span className={`result-status ${detected ? 'recognized-status' : 'unknown-status'}`}>
          {detected ? 'Detected' : 'Not Detected'}
        </span>
        <span className="result-time">{timestamp}</span>
      </div>

      {detected && name && (
        <div className="result-content">
          <div className="result-row">
            <span className="result-label">Name:</span>
            <span className="result-value name-value">{name}</span>
          </div>
          {confidence !== undefined && (
            <div className="result-row">
              <span className="result-label">Confidence:</span>
              <span className="result-value confidence-value">
                {(confidence * 100).toFixed(1)}%
              </span>
              <div className="confidence-bar">
                <div
                  className="confidence-fill"
                  style={{ width: `${Math.min(confidence * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {!detected && (
        <div className="result-content">
          <p className="unknown-message">No matching face detected in database</p>
          {message && (
            <p className="result-message">{message}</p>
          )}
        </div>
      )}
    </div>
  );
}

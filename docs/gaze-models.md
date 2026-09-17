# Gaze estimation models

OpenEyeTrack supports interchangeable calibration models so algorithms can be compared using the same calibration and independent validation procedure.

- **Linear ridge**: interpretable regularised baseline using standardized eye-relative and head-pose features.
- **Polynomial ridge**: adds quadratic and interaction terms for smooth nonlinear mappings. More flexible, with greater overfitting risk.
- **RBF kernel regression**: nonlinear kernel model that can learn curved mappings between eye/head features and screen position. Recommended nonlinear prototype.
- **k-nearest neighbours**: local non-parametric baseline using inverse-distance weighting.

For model comparisons, keep calibration settings identical and compare independent validation accuracy, RMS sample-to-sample precision, spatial SD and data loss. With nonlinear models, 13 points and at least 2 repetitions are recommended for development testing.

Model settings are written into exported sample-level data (`gazeModel`, `gazeModelRidge`, `gazeModelRbfGamma`, `gazeModelK`) so recordings remain auditable.

These models are experimental baselines and should be benchmarked against held-out validation targets and, where available, simultaneous laboratory eye-tracker data before scientific use.

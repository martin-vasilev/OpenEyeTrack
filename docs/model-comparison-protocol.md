# Model comparison protocol

For an initial within-person algorithm comparison:

1. Use the same browser, camera position, lighting and screen geometry.
2. Use 13 calibration points, 2 repetitions, 700 ms settle time and 900 ms sampling time.
3. Run each algorithm in a separate calibration + validation cycle.
4. Compare validation mean/median/RMSE accuracy, RMS-S2S precision, spatial SD and data loss.
5. Repeat model order across sessions rather than always testing the most flexible model last.
6. Preserve raw and filtered gaze coordinates for downstream comparison.

Suggested first comparison: linear ridge vs polynomial ridge vs RBF kernel regression. kNN is included mainly as a simple local non-parametric baseline.

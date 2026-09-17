# Algorithm notes

Model flexibility is not the same as validation performance. Calibration datasets are small, so nonlinear models can overfit. Independent validation is therefore the primary comparison criterion.

RBF kernel regression is included as the main higher-capacity nonlinear model because it is practical for small calibration sets and runs entirely in the browser. Larger machine-learning models (random forests, gradient boosting, neural networks) are better candidates once OpenEyeTrack supports pretrained population-level models using larger EyeLink-labelled datasets; fitting them from a single 13- or 26-observation calibration is unlikely to be reliable.

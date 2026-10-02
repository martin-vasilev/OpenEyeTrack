# Portable SDK acceptance test

This test is intentionally separate from the OpenEyeTrack application. The generated test kit contains only:

- this standalone HTML page; and
- a copied OpenEyeTrack SDK distributable under `openeyetrack/`.

The page imports `./openeyetrack/openeyetrack.es.js` and does not import anything from `src/`.

## Build and run

From the repository:

```bash
npm run build:sdk-portable-test
npm run serve:sdk-portable-test
```

Then open the localhost address printed by the server. Browsers treat localhost as a secure context, so webcam permission can be requested.

The manual acceptance sequence is:

1. Start camera.
2. Run the SDK-owned setup/calibration UI.
3. Start recording.
4. Look around for several seconds.
5. Stop and retrieve data.
6. Confirm that the page reports PASS with a non-zero sample count.
7. Download the CSV and summary JSON.

The default checkbox uses a shortened 5-target × 1-run calibration for smoke testing. Untick it to use the SDK's current full calibration defaults.

// One copy source for every Time Clock identify surface - the kiosk Quick
// Clock card, the reusable FaceRecognition panel, and the Admin Settings
// gate all present the same camera instructions.
export const IDENTIFY_CAMERA_BLURB = "Look at the camera or hold up your QR badge.";
export const IDENTIFY_QR_BADGE_BLURB_FACE = "Show your face or scan your secure Time Clock QR badge.";
export const IDENTIFY_QR_BADGE_BLURB = "Scan your secure Time Clock QR badge.";
export const IDENTIFY_QR_ONLY_BLURB = "Hold your QR badge up to the camera.";
// Browsers without BarcodeDetector still scan badges - via the Scan QR badge
// button (html5-qrcode). Never tell users QR is impossible when that button
// is on screen.
export const IDENTIFY_QR_BUTTON_PROMPT = "Tap Scan QR badge to use your code, or type a username.";

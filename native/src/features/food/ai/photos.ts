// Expo SDK 58 APIs: https://docs.expo.dev/versions/v58.0.0/sdk/imagemanipulator/
// Only a newly rendered JPEG goes to the queue; asset metadata never crosses it.
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { t } from "../../../i18n/en";
import type { Photo } from "./service";
/** Drop APP1 (EXIF/XMP) segments from the newly encoded JPEG before storage. */
export function stripJpegMetadata(base64: string): string {
  const bytes = atob(base64);
  if (bytes.charCodeAt(0) !== 255 || bytes.charCodeAt(1) !== 216) return base64;
  let result = bytes.slice(0, 2), offset = 2;
  while (offset < bytes.length) {
    if (bytes.charCodeAt(offset) !== 255) throw new Error(t("foodAiFailure"));
    const start = offset;
    while (bytes.charCodeAt(offset) === 255) offset++;
    const marker = bytes.charCodeAt(offset++);
    if (marker === 218 || marker === 217) return btoa(result + bytes.slice(start));
    const size = bytes.charCodeAt(offset) * 256 + bytes.charCodeAt(offset + 1);
    if (!Number.isFinite(size) || size < 2 || offset + size > bytes.length) throw new Error(t("foodAiFailure"));
    if (marker !== 225) result += bytes.slice(start, offset + size);
    offset += size;
  }
  throw new Error(t("foodAiFailure"));
}
async function render(
  uri: string,
  width: number,
  height: number,
  max: number,
  compress: number,
) {
  const context = ImageManipulator.manipulate(uri),
    scale = Math.min(1, max / Math.max(width, height));
  context.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  });
  const image = await context.renderAsync();
  try {
    const result = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress,
      base64: true,
    });
    try {
      if (!result.base64) throw new Error(t("foodAiFailure"));
      return stripJpegMetadata(result.base64);
    } finally {
      const file = new File(result.uri);
      if (file.exists) file.delete();
    }
  } finally {
    image.release();
    context.release();
  }
}
export async function pickMealPhoto(camera: boolean, consent: () => boolean = () => false): Promise<Photo | null> {
  const permission = () => { if (!consent()) throw new Error(t("foodAiConsentRequired")); };
  permission();
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
    throw new Error(t("foodAiPermission"));
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    exif: false,
    base64: false,
    quality: 1,
  };
  permission();
  const result = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  try {
    permission();
    const jpeg = await render(asset.uri, asset.width, asset.height, 1280, 0.7);
    let thumbnail = await render(
      asset.uri,
      asset.width,
      asset.height,
      320,
      0.55,
    );
    if (thumbnail.length > 40960)
      thumbnail = await render(asset.uri, asset.width, asset.height, 200, 0.35);
    if (thumbnail.length > 40960) throw new Error(t("foodAiFailure"));
    permission();
    return { jpeg, thumbnail };
  } finally {
    // Picker output is temporary app cache; never delete a library content URI.
    if (asset.uri.startsWith("file:")) {
      const file = new File(asset.uri);
      if (file.exists) file.delete();
    }
  }
}

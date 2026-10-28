// Expo SDK 58 APIs: https://docs.expo.dev/versions/v58.0.0/sdk/imagemanipulator/
// Only a newly rendered JPEG goes to the queue; asset metadata never crosses it.
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { t } from "../../../i18n/en";
import type { Photo } from "./service";
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
      return result.base64;
    } finally {
      const file = new File(result.uri);
      if (file.exists) file.delete();
    }
  } finally {
    image.release();
    context.release();
  }
}
export async function pickMealPhoto(camera: boolean): Promise<Photo | null> {
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
    throw new Error(t("foodAiPermission"));
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    exif: false,
    base64: false,
    quality: 1,
  };
  const result = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  try {
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
    return { jpeg, thumbnail };
  } finally {
    // Picker output is temporary app cache; never delete a library content URI.
    if (asset.uri.startsWith("file:")) {
      const file = new File(asset.uri);
      if (file.exists) file.delete();
    }
  }
}

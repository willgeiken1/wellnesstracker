import { pickMealPhoto, stripJpegMetadata } from "../src/features/food/ai/photos";
import { ImageManipulator } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
const mockResize = jest.fn(),
  mockDelete = jest.fn(),
  mockRelease = jest.fn(),
  mockSave = jest.fn(async () => ({uri: "file:///synthetic-render.jpg", base64: "YWJj"}));
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: mockResize,
      release: mockRelease,
      renderAsync: async () => ({
        release: mockRelease,
        saveAsync: mockSave,
      }),
    })),
  },
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({
    canceled: false,
    assets: [
      {
        uri: "file:///synthetic-meal.jpg",
        width: 4000,
        height: 3000,
        exif: { private: "synthetic-metadata" },
      },
    ],
  })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock("expo-file-system", () => ({
  File: jest.fn(() => ({ exists: true, delete: mockDelete })),
}));
beforeEach(() => jest.clearAllMocks());
test("rendered JPEG longest edge is 1280; thumbnail is bounded, source metadata and files are discarded", async () => {
  const photo = await pickMealPhoto(true, () => true);
  expect(mockResize.mock.calls).toEqual([
    [{ width: 1280, height: 960 }],
    [{ width: 320, height: 240 }],
  ]);
  expect(photo).toEqual({ jpeg: "YWJj", thumbnail: "YWJj" });
  expect(JSON.stringify(photo)).not.toContain("metadata");
  expect(mockDelete).toHaveBeenCalledTimes(3);
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(
    expect.objectContaining({ exif: false, base64: false }),
  );
});
test("picker cancellation and permission denial never produce a queued photo", async () => {
  expect(await pickMealPhoto(false, () => true)).toBeNull();
  expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  jest
    .mocked(ImagePicker.requestCameraPermissionsAsync)
    .mockResolvedValueOnce({
      granted: false,
    } as ImagePicker.CameraPermissionResponse);
  await expect(pickMealPhoto(true, () => true)).rejects.toThrow();
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
});

test("picker refuses absent or revoked consent before opening camera/library", async () => {
 await expect(pickMealPhoto(false)).rejects.toThrow();
 expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
 let allowed = true;
 jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockImplementationOnce(async () => { allowed = false; return {granted:true} as ImagePicker.CameraPermissionResponse; });
 await expect(pickMealPhoto(true, () => allowed)).rejects.toThrow();
 expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
});
test("JPEG output has no APP1/EXIF marker and keeps image scan bytes", () => {
 const scan = "\xff\xda\x00\x02synthetic-pixels\xff\xd9";
 const exif = "\xff\xe1\x00\x0aExif\x00\x00ab";
 const encoded = btoa("\xff\xd8" + exif + scan);
 const output = atob(stripJpegMetadata(encoded));
 expect(output).not.toContain("Exif"); expect(output).not.toContain("\xff\xe1");
 expect(output).toBe("\xff\xd8" + scan);
 expect(stripJpegMetadata(btoa(output))).toBe(btoa(output));
 expect(() => stripJpegMetadata(btoa("\xff\xd8\xff\xe1\xff\xff"))).toThrow();
});

test("picker output strips APP1 even if the encoder preserves source EXIF", async () => {
 const scan = "\xff\xda\x00\x02synthetic-pixels\xff\xd9";
 const encoded = btoa("\xff\xd8\xff\xe1\x00\x0aExif\x00\x00ab" + scan);
 mockSave.mockResolvedValueOnce({uri:"file:///synthetic-render.jpg",base64:encoded});
 const photo = await pickMealPhoto(true,()=>true);
 expect(atob(photo!.jpeg)).toBe("\xff\xd8" + scan);
 expect(atob(photo!.jpeg)).not.toMatch(/Exif|\xff\xe1/);
});

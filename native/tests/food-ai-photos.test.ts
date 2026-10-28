import { pickMealPhoto } from "../src/features/food/ai/photos";
import { ImageManipulator } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
const mockResize = jest.fn(),
  mockDelete = jest.fn(),
  mockRelease = jest.fn();
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: mockResize,
      release: mockRelease,
      renderAsync: async () => ({
        release: mockRelease,
        saveAsync: async () => ({
          uri: "file:///synthetic-render.jpg",
          base64: "YWJj",
        }),
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
  const photo = await pickMealPhoto(true);
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
  expect(await pickMealPhoto(false)).toBeNull();
  expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  jest
    .mocked(ImagePicker.requestCameraPermissionsAsync)
    .mockResolvedValueOnce({
      granted: false,
    } as ImagePicker.CameraPermissionResponse);
  await expect(pickMealPhoto(true)).rejects.toThrow();
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
});

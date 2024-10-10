import {
  Rows,
  Text,
  FileInput,
  SegmentedControl,
  Button,
  ProgressBar,
  Alert,
  FormField,
  FileInputItem,
  Title,
  Box,
  ReloadIcon,
  Badge,
} from "@canva/app-ui-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ContentDraft,
  ImageRef,
  ImageElementAtPoint
} from "@canva/design";
import { addElementAtPoint, selection } from "@canva/design";
import { useMutation } from "@tanstack/react-query";
import styles from "styles/components.css";
import type { ImageMimeType } from "@canva/asset";
import { getTemporaryUrl, upload } from "@canva/asset";
import ReactCompareImage from "react-compare-image";

const maxImageSize = 2500 * 2500 * 2;
async function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.readAsDataURL(file);
  });
}

async function getImagePixels(file: Blob) {
  return new Promise<{ pixels: number; width: number; height: number }>(
    (resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          pixels: img.width * img.height,
          width: img.width,
          height: img.height,
        });
      };
      img.src = URL.createObjectURL(file);
    }
  );
}

async function readCanvaNativeImageURL(url: string): Promise<File> {
  const res = await fetch(url);
  const formatMatch = url.match(/format:([A-Z]+)/);
  const ext = formatMatch ? formatMatch[1].toLowerCase() : "png";
  return new File([await res.blob()], `selected-image.${ext}`, {
    type: `image/${ext}`,
  });
}

export const App = () => {
  const [[file], setFiles] = useState<File[]>([]);
  const [imageSourceType, setImageSourceType] = useState<
    "upload" | "content" | "unknown"
  >("unknown");
  const [contentDraft, setContentDraft] = useState<ContentDraft<{
    ref: ImageRef;
  }> | null>(null);
  const [enlargeFactor, setEnlargeFactor] = useState("2");
  const [originImageURL, setOriginImageURL] = useState("");
  const [imagePixels, setImagePixels] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hasSelect, setHasSelect] = useState(false);

  const {
    data: enlargedData,
    mutateAsync,
    isPending: uploading,
    error: processImageError,
    reset: resetProcessImage,
  } = useMutation({
    mutationFn: async ({
      file,
      enlargeFactor,
    }: {
      file: File;
      enlargeFactor: string;
    }) => {
      const body = new FormData();
      body.append("file", file);
      body.append("enlarge_actor", enlargeFactor);
      setUploadProgress(0);
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev === 75) {
            clearInterval(interval);
            return prev;
          }
          return Math.min(prev + 1, 75);
        });
      }, 200);

      try {
        const res = await fetch(`${BACKEND_HOST}/enlarge`, {
          // send form data via multipart/form-data
          method: "POST",
          body,
        });

        setUploadProgress(100);

        if (res.status !== 200) {
          if (res.status === 500) {
            throw new Error("Server error, please try again");
          }
          if (res.status === 504 || res.status === 524) {
            throw new Error("Request timeout, please try again");
          }

          if (res.status === 413) {
            throw new Error(
              "Image too large, please replace with a smaller image"
            );
          }
          throw new Error("Failed to process image:" + res.statusText);
        }
        const file2 = new File([await res.blob()], file.name, {
          type: 'image/png',
        });
        return { url: await fileToDataUrl(file2), file: file2 };
      } catch (e) {
        if (e instanceof Error && e.message === "Failed to fetch") {
          throw new Error("Failed to connect to server, please try again");
        }
      }
    },
  });
  const enlargedUrl = enlargedData?.url;

  const stateRef = useRef({ imageSourceType, uploading, enlargedUrl });

  stateRef.current = {
    imageSourceType,
    uploading,
    enlargedUrl,
  };

  useEffect(() => {
    return selection.registerOnChange({
      scope: "image",
      async onChange(event) {
        const draft = await event.read();
        const ref = draft.contents[0]?.ref;
        setHasSelect(!!ref);
        const { imageSourceType, enlargedUrl, uploading } = stateRef.current;
        if (imageSourceType === "upload" || enlargedUrl || uploading) {
          return;
        }

        setContentDraft(draft);
        if (ref) {
          setImageSourceType("content");
          const { url } = await getTemporaryUrl({
            type: 'image',
            ref,
          });

          const file = await readCanvaNativeImageURL(url);
          setFiles([file]);
        } else if (imageSourceType === "content" && !uploading) {
          resetData();
        }
      },
    });
  }, []);

  useEffect(() => {
    if (!file || !FileReader) {
      return;
    }

    fileToDataUrl(file).then(setOriginImageURL);
    getImagePixels(file).then(({ pixels }) => setImagePixels(pixels));
  }, [file]);

  const {
    mutate: acceptImage,
    reset: resetAcceptImage,
    data: acceptResult,
    error
  } = useMutation({
    mutationKey: [],
    mutationFn: async ({enlargedUrl, file, hasSelect}: {
      enlargedUrl: string,
      file: File,
      hasSelect: boolean
    }) => {
      if (
        contentDraft?.contents.length &&
        imageSourceType === "content" && hasSelect) {
        const asset = await upload({
          type: 'image',
          url: enlargedUrl,
          thumbnailUrl: enlargedUrl,
          mimeType: 'image/png' as ImageMimeType,
          parentRef: contentDraft.contents[0].ref,
          aiDisclosure: 'app_generated'
        });

        contentDraft.contents[0].ref = asset.ref;
        await contentDraft.save();
        return "replaced";
      } else {
        await addElementAtPoint({
          type: 'image',
          dataUrl: enlargedUrl,
        } as ImageElementAtPoint);
        return "added";
      }
    },
  });

  const enlargeFactorOptions = useMemo(() => {
    return [
      { value: "2", label: "2X", disabled: imagePixels * 2 > maxImageSize },
      { value: "3", label: "3X", disabled: imagePixels * 3 > maxImageSize },
      { value: "4", label: "4X", disabled: imagePixels * 4 > maxImageSize },
      { value: "8", label: "8X", disabled: imagePixels * 8 > maxImageSize },
    ];
  }, [originImageURL, imagePixels]);

  const resetData = () => {
    setFiles([]);
    setEnlargeFactor("2");
    setOriginImageURL("");
    resetProcessImage();
    setImageSourceType("unknown");
    resetAcceptImage();
  };

  const isPixelExceeded = enlargeFactorOptions.every(
    (option) => option.disabled
  );

  const isFileExceeded = file?.size > 1024 * 1024 * 5; // 5MB

  if (uploading) {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        display="flex"
        className={styles.scrollContainer}
        paddingEnd="2u"
      >
        <Rows spacing="2u">
          <Title size="small" alignment="center">
            Generating your image
          </Title>
          <ProgressBar value={uploadProgress} />
          <Text alignment="center" size="small" tone="tertiary">
            Please wait, this should only take a few moments
          </Text>
          <Button onClick={resetData} variant="secondary">
            Cancel
          </Button>
        </Rows>
      </Box>
    );
  }

  return (
    <div className={styles.scrollContainer}>
      {enlargedUrl ? (
        <Rows spacing="2u">
          <>
            <Rows spacing="1u">
              {!!acceptResult && (
                <Alert tone="positive"
                onDismiss={resetAcceptImage}
                >
                  <Text variant="bold">
                    {acceptResult === "added"
                      ? "Image added to design"
                      : "Image replaced"}
                  </Text>
                </Alert>
              )}

              <Text variant="bold" size="medium">
                Preview
              </Text>

              <div className={styles.imageCompareContainer}>
                <ReactCompareImage
                  sliderLineColor=""
                  leftImage={originImageURL}
                  rightImage={enlargedUrl}
                  leftImageLabel={<Badge tone="contrast" text="Before" />}
                  rightImageLabel={<Badge tone="contrast" text="After" />}
                />
              </div>
            </Rows>

            <Rows spacing="1u">
              <Button
                variant="primary"
                onClick={() => acceptImage({ enlargedUrl, file, hasSelect })}
              >
                {imageSourceType === "upload" || !hasSelect
                  ? "Add to design"
                  : "Replace"}
              </Button>
              <Button variant="secondary" onClick={resetData} icon={ReloadIcon}>
                Go back
              </Button>
            </Rows>
          </>
        </Rows>
      ) : (
        <Rows spacing="2u">
          <>
            <FormField
              description={
                originImageURL
                  ? ""
                  : "Upload an image or select one in your design to enlarge"
              }
              label="Original image"
              control={(props) =>
                originImageURL ? (
                  <>
                    {/* eslint-disable-next-line react/forbid-elements */}
                    <img src={originImageURL} className={styles.originImage} />

                    {imageSourceType === "upload" && (
                      <FileInputItem
                        onDeleteClick={() => {
                          resetData();
                        }}
                        label={file?.name}
                      />
                    )}
                  </>
                ) : (
                  <FileInput
                    {...props}
                    accept={[
                      "image/png",
                      "image/jpeg",
                      "image/jpg",
                      "image/webp",
                    ]}
                    stretchButton
                    onDropAcceptedFiles={(files) => {
                      setImageSourceType("upload");
                      setFiles(files);
                    }}
                  />
                )
              }
            />

            {!!file && (
              <FormField
                error={
                  (isPixelExceeded || isFileExceeded) &&
                  "This File is too large.Please choose one that's smaller than 2500px x 2500px or 5MB."
                }
                label="Scale amount"
                control={(props) => (
                  <SegmentedControl
                    {...props}
                    defaultValue="2"
                    value={enlargeFactor}
                    onChange={setEnlargeFactor}
                    options={enlargeFactorOptions}
                  />
                )}
              />
            )}
            {!!file && (
              <Button
                stretch
                variant="primary"
                type="submit"
                disabled={!file}
                onClick={() => mutateAsync({ file, enlargeFactor })}
              >
                Generate
              </Button>
            )}
            {processImageError && (
              <Alert tone="critical">{processImageError.message}</Alert>
            )}
          </>
        </Rows>
      )}
    </div>
  );
};

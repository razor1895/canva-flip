import { Button, Rows, Text, Alert, Title, Slider } from "@canva/app-ui-kit";
import type { ImageRef } from "@canva/design";
import { requestExport, selection } from "@canva/design";
import { useEffect, useState, useRef } from "react";
import { getTemporaryUrl } from "@canva/asset";

import "../styles/components.css";

export const Caption = ({ children, selected, onClick }: { children: React.ReactNode, selected: boolean, onClick: () => void }) => {
  const [hover, setIsHovered] = useState(false);
  let bgColor = hover ? 'rgba(64,87,109,.07)' : 'transparent';

  if (selected) {
    bgColor = 'rgba(57,76,96,.15)';
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        transition: 'background-color .1s linear,border-color .1s linear,color .1s linear',
        color: '#0d1216',
        justifyContent: 'center',
        alignItems: 'center',
        height: 32,
        padding: '0 8px',
        outline: 'none',
        cursor: 'pointer',
        maxWidth: '100%',
        verticalAlign: 'middle',
        backgroundColor: bgColor,
        borderRadius: 8,
        boxSizing: 'border-box',
        border: '2px solid transparent',
        fontSize: '14px',
        fontWeight: selected ? 600 : 400,
        minWidth: 80
      }}
    >
      {children}
    </div>
  )
}

export const App = () => {
  const [selectedImage, setSelectedImage] = useState<ImageRef | undefined>();
  const [imageAdded, setImageIsAdded] = useState(false);
  const [url, setUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedFlip, setSelectedFlip] = useState<'horizontal' | 'vertical' | 'both' | ''>('');
  const canvasRef = useRef<HTMLCanvasElement>(null); // Reference to the canvas
  const [opacity, setOpacity] = useState<number>(); // undefined value to avoid set opa

  /* Function Area Start */
  const createFlip = async () => {
    if (selectedImage) {
      try {
        // get the temporary URL
        const { url: temporaryUrl } = await getTemporaryUrl({
          ref: selectedImage,
          type: 'image',
        });
        setUrl(temporaryUrl);
        setImageIsAdded(true);
      } catch (error) {
        setErrorMsg('Failed to get temporary URL');
      }
    } else {
      setImageIsAdded(false);
    }
  };

  const reset = () => {
    setSelectedFlip('');
    setOpacity(1);
  }

  // download the canvas image
  const download = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "image.png";
      link.href = image;
      // Append the link to the document
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
  /* Function Area End */

  /* Effect Area Start */
  useEffect(() => {
    // Register a callback that runs when the selection changes
    // This will run when the user selects one or more images
    selection.registerOnChange({
      scope: "image",
      onChange: async (event) => {
        if (event.count > 0) {
          const selection = await event.read();
          // we only accept one image
          setSelectedImage(selection.contents[0].ref);
        } else {
          // if user cancels selection
          setSelectedImage(undefined);
        }
      },
    });
  }, []);

  useEffect(() => {
    if (url && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
  
      if (ctx) {
        const image = new Image();
        image.crossOrigin = "Anonymous";  // Allow cross-origin image loading
        image.src = url;
        image.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
  
          // Save the current state before applying transformations
          ctx.save();

          // set the opacity
          ctx.globalAlpha = typeof opacity === 'number' ? opacity : 1;
  
          // Set the transform based on selectedFlip
          switch (selectedFlip) {
            case 'horizontal':
              ctx.scale(-1, 1); // Flip horizontally
              ctx.drawImage(image, -canvas.width, 0, canvas.width, canvas.height); // Adjust position
              break;
            case 'vertical':
              ctx.scale(1, -1); // Flip vertically
              ctx.drawImage(image, 0, -canvas.height, canvas.width, canvas.height); // Adjust position
              break;
            case 'both':
              ctx.scale(-1, -1); // Flip both horizontally and vertically
              ctx.drawImage(image, -canvas.width, -canvas.height, canvas.width, canvas.height); // Adjust position
              break;
            default:
              ctx.drawImage(image, 0, 0, canvas.width, canvas.height); // No flip, default case
          }
  
          // Restore the context state
          ctx.restore();
        };
  
        image.onerror = () => {
          setErrorMsg("Failed to load image");
        };
      }
    }
  }, [url, selectedFlip, opacity]);
  /* Effect Area End */

  return (
    <div className="scrollContainer" style={{ padding: `16px 12px` }}>
      <Rows spacing="2u">
        {errorMsg && <Alert tone="critical">{errorMsg}</Alert>}
      </Rows>
      {imageAdded && (
        <>
          <div
            id="canvas"
            style={{
              alignItems: "center",
              aspectRatio: "4 / 3",
              backgroundColor: "var(--ui-kit-color-neutral-low)",
              border: "1px solid var(--ui-kit-color-border)",
              borderRadius: 4,
              display: "flex",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <canvas ref={canvasRef} style={{ width: "92%", height: "92%" }} />
          </div>
          <div style={{ marginTop: '16px', marginBottom: '8px' }}>
            <Title size="small">Flip</Title>
          </div>
          <div
            style={{
              alignItems: 'center',
              border: '1px solid var(--ui-kit-color-border)',
              justifyContent: 'space-between',
              borderRadius: 4,
              boxSizing: 'border-box',
              display: 'flex',
              height: 40,
              outlineOffset: 2,
              padding: 4,
            }}
          >
            <Caption selected={selectedFlip === 'horizontal'} onClick={() => setSelectedFlip('horizontal')}>Horizontal</Caption>
            <Caption selected={selectedFlip === 'vertical'} onClick={() => setSelectedFlip('vertical')}>Vertical</Caption>
            <Caption selected={selectedFlip === 'both'} onClick={() => setSelectedFlip('both')}>Both</Caption>
          </div>
          <div style={{ marginTop: '16px', marginBottom: '8px' }}>
            <Title size="small">Opacity</Title>
          </div>
          <Slider defaultValue={1} step={0.01} min={0} max={1} onChange={(value) => setOpacity(value)} />
          <div style={{ marginTop: '16px' }}>
            <Button variant="primary" onClick={reset} stretch>
              Reset
            </Button>
          </div>
          <div style={{ marginTop: '16px' }}>
            <Button variant="primary" onClick={download} stretch>
              Download
            </Button>
          </div>
        </>
      )}
      {!imageAdded && (
        <Rows spacing="2u">
          <Text>Select an image in your design.</Text>
          <Button variant="primary" disabled={!selectedImage} onClick={createFlip} stretch>
            Create Flip!
          </Button>
        </Rows>
      )}
    </div>
  );
};

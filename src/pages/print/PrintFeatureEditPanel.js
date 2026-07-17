import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { svgMap } from '../../components/map/printShapes/svgMap';
import { annotationCapabilities } from './annotationModel';
import { getPointIconCatalogLabel } from './printCatalog';
import { getPointIconDefaultStyle } from './pointIconDefaultStyles';
import { MAP_LABEL_FONT_OPTIONS } from './mapLabelUtils';
import { useMapContext } from '../MapContext';
import { useUser } from '../../contexts/UserContext';
import { uploadMapPhoto, deleteMapPhoto } from '../../utils/mapPhotoUpload';
import {
  getPhotosFromElement,
  photoEntryToSrc,
  validateMapPhotoFile,
} from '../../utils/mapPhotoStorage';
import {
  extractImageFilesFromDataTransfer,
  extractImageUrlsFromDataTransfer,
  fetchImageUrlAsFile,
} from '../../utils/listingPhotoDrop';
import {
  PRINT_GALLERY_DRAG_MIME,
  takePrintGalleryDragPayload,
} from '../../utils/printGalleryDragBuffer';
import './Print.css';

function NavRow({ children, onClick }) {
  return (
    <button type="button" className="print-feature-nav-row" onClick={onClick}>
      <span>{children}</span>
      <span className="print-feature-nav-chevron" aria-hidden>
        ›
      </span>
    </button>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatOpacityDisplay(n) {
  const v = Math.max(0, Math.min(1, Number(n)));
  if (Number.isNaN(v)) return '0';
  return String(Math.round(v * 100) / 100);
}

function OpacitySliderRow({ label, value, onChange }) {
  const v = Math.max(0, Math.min(1, value ?? 1));
  return (
    <label className="print-feature-field">
      {label}
      <div className="print-feature-opacity-row">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="print-feature-opacity-value" aria-live="polite">
          {formatOpacityDisplay(v)}
        </span>
      </div>
    </label>
  );
}

/**
 * Print feature editor — fixed on map (Save / Back are in the Print side panel).
 * Main view: name, notes, metrics, show-label toggle, nav rows.
 * Sub-views: same card area, back arrow + scrollable options (reduces main scroll).
 */
export default function PrintFeatureEditPanel({
  selectedPrintElement,
  updatePrintElement,
  deletePrintElement,
  onRequestClose,
}) {
  const { printMapId } = useMapContext();
  const { user } = useUser();
  const [subPanel, setSubPanel] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoDropActive, setPhotoDropActive] = useState(false);
  const photoInputRef = useRef(null);
  const photoDropDepthRef = useRef(0);

  useEffect(() => {
    setSubPanel(null);
    setLightboxIndex(null);
    photoDropDepthRef.current = 0;
    setPhotoDropActive(false);
  }, [selectedPrintElement?.id]);

  useEffect(() => {
    if (lightboxIndex === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxIndex(null);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [lightboxIndex]);

  if (!selectedPrintElement) return null;

  const caps =
    annotationCapabilities[selectedPrintElement.type] || annotationCapabilities.shape;
  const showSize =
    selectedPrintElement.geometry?.type !== 'Polygon' &&
    selectedPrintElement.type !== 'polyline' &&
    selectedPrintElement.type !== 'arrow';

  const rawTypeStr =
    typeof selectedPrintElement.type === 'string'
      ? selectedPrintElement.type.replace(/-/g, ' ')
      : 'Feature';
  const catalogShapeName =
    selectedPrintElement.type === 'shape' && selectedPrintElement.svgKey
      ? getPointIconCatalogLabel(selectedPrintElement.svgKey)
      : '';
  const typeLabel =
    selectedPrintElement.type === 'shape' && selectedPrintElement.svgKey
      ? (selectedPrintElement.label || '').trim() || catalogShapeName || rawTypeStr
      : rawTypeStr;
  const badgeLetter =
    selectedPrintElement.type === 'shape' && selectedPrintElement.svgKey
      ? null
      : (selectedPrintElement.label && selectedPrintElement.label.trim()[0]) ||
        rawTypeStr[0]?.toUpperCase() ||
        '?';

  const handleDelete = () => {
    if (window.confirm('Delete this feature?')) {
      deletePrintElement(selectedPrintElement.id);
      onRequestClose?.();
    }
  };

  const photos = getPhotosFromElement(selectedPrintElement);

  const uploadPhotoFiles = async (files, { manageBusyState = true } = {}) => {
    const imageFiles = (files || []).filter((f) => f?.type?.startsWith('image/'));
    if (!imageFiles.length) {
      window.alert('Please drop or select image files.');
      return;
    }
    if (!user?.uid) {
      window.alert('Sign in to upload photos.');
      return;
    }
    for (const file of imageFiles) {
      const err = validateMapPhotoFile(file);
      if (err) {
        window.alert(err);
        return;
      }
    }
    if (manageBusyState) setPhotoUploading(true);
    try {
      const added = [];
      for (const file of imageFiles) {
        const { url, storagePath } = await uploadMapPhoto(user.uid, file, { mapId: printMapId });
        added.push({ url, storagePath });
      }
      const nextPhotos = [...photos, ...added];
      updatePrintElement({
        ...selectedPrintElement,
        photoGallery: nextPhotos,
        photoDataUrl: null,
      });
    } catch (err) {
      console.error('Photo upload failed:', err);
      window.alert(err?.message || 'Failed to upload photo.');
    } finally {
      if (manageBusyState) setPhotoUploading(false);
    }
  };

  const handlePhotoUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    await uploadPhotoFiles(files);
  };

  const resetPhotoDropState = () => {
    photoDropDepthRef.current = 0;
    setPhotoDropActive(false);
  };

  const handlePhotoDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (photoUploading) return;
    photoDropDepthRef.current += 1;
    setPhotoDropActive(true);
  };

  const handlePhotoDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    photoDropDepthRef.current = Math.max(0, photoDropDepthRef.current - 1);
    if (photoDropDepthRef.current === 0) setPhotoDropActive(false);
  };

  const handlePhotoDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };

  // Append photos that are already in our storage (e.g. dragged from the left
  // gallery) directly — no re-fetch/upload, so CORS can't block it.
  const appendExistingPhotos = (entries) => {
    const seen = new Set(photos.map((p) => p.url));
    const additions = [];
    (entries || []).forEach((entry) => {
      const url = String(entry?.url || '').trim();
      if (!url || seen.has(url)) return;
      seen.add(url);
      additions.push({ url, storagePath: entry.storagePath || null });
    });
    if (!additions.length) return;
    updatePrintElement({
      ...selectedPrintElement,
      photoGallery: [...photos, ...additions],
      photoDataUrl: null,
    });
  };

  const ingestPhotoTransfer = async (dataTransfer) => {
    // Internal drag from the image gallery: reuse the existing storage ref.
    const galleryId = dataTransfer?.getData?.(PRINT_GALLERY_DRAG_MIME);
    if (galleryId) {
      const payload = takePrintGalleryDragPayload(galleryId);
      if (payload?.url) {
        appendExistingPhotos([payload]);
        return;
      }
    }

    const transferFiles = extractImageFilesFromDataTransfer(dataTransfer);
    if (transferFiles.length) {
      await uploadPhotoFiles(transferFiles);
      return;
    }

    const urls = extractImageUrlsFromDataTransfer(dataTransfer);
    if (!urls.length) {
      window.alert('Paste or drop image files, or an image from another tab.');
      return;
    }

    setPhotoUploading(true);
    try {
      const fetched = [];
      for (const url of urls.slice(0, 12)) {
        const file = await fetchImageUrlAsFile(url);
        if (file) fetched.push(file);
      }
      if (!fetched.length) {
        window.alert(
          'Could not load those images here (site blocked the transfer). Save them locally, then paste or drop the files.'
        );
        return;
      }
      await uploadPhotoFiles(fetched, { manageBusyState: false });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePhotoDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    resetPhotoDropState();
    if (photoUploading) return;
    await ingestPhotoTransfer(event.dataTransfer);
  };

  const handlePhotoPaste = async (event) => {
    if (photoUploading) return;
    const files = extractImageFilesFromDataTransfer(event.clipboardData);
    const urls = extractImageUrlsFromDataTransfer(event.clipboardData);
    if (!files.length && !urls.length) return;
    event.preventDefault();
    await ingestPhotoTransfer(event.clipboardData);
  };

  const handleRemoveAllPhotos = async () => {
    await Promise.all(photos.map((p) => deleteMapPhoto(p.storagePath)));
    updatePrintElement({
      ...selectedPrintElement,
      photoGallery: [],
      photoDataUrl: null,
    });
  };

  const metricsBlock = (
    <>
      {(selectedPrintElement.type === 'polygon' || selectedPrintElement.type === 'polyline') && (
        <div className="print-feature-metrics">
          {selectedPrintElement.areaSqMeters != null && (
            <div>
              Area: {(selectedPrintElement.areaSqMeters / 4046.8564224).toFixed(3)} ac
            </div>
          )}
          {selectedPrintElement.perimeterMeters != null && (
            <div>Perimeter: {(selectedPrintElement.perimeterMeters * 3.28084).toFixed(0)} ft</div>
          )}
          {selectedPrintElement.lengthMeters != null && (
            <div>Length: {(selectedPrintElement.lengthMeters * 3.28084).toFixed(0)} ft</div>
          )}
        </div>
      )}

      {selectedPrintElement.type === 'arrow' && selectedPrintElement.lengthMeters != null && (
        <div className="print-feature-metrics">
          <div>Length: {(selectedPrintElement.lengthMeters * 3.28084).toFixed(0)} ft</div>
        </div>
      )}
    </>
  );

  const isLineFeature =
    selectedPrintElement.type === 'polyline' || selectedPrintElement.type === 'arrow';
  const isLogoPoint =
    selectedPrintElement.type === 'shape' &&
    typeof selectedPrintElement.svgKey === 'string' &&
    [
      'bridgeWater',
      'cabin',
      'camera',
      'farm',
      'garageCar',
      'hiking',
      'horseSaddle',
      'houseChimney',
      'locationPinParking',
      'planeAlt',
      'school',
      'skiing',
      'skiingNordic',
      'swimmer',
      'tablePicnic',
    ].includes(selectedPrintElement.svgKey);
  const strokeColorLabel = isLineFeature ? 'Line color' : 'Border color';
  const strokeWidthLabel = isLineFeature ? 'Line width' : 'Border width';
  const strokeOpacityLabel = isLineFeature ? 'Line opacity' : 'Border opacity';

  const applyAppearancePatch = (patch, options = {}) => {
    const { keepDash = false } = options;
    updatePrintElement({
      ...selectedPrintElement,
      ...patch,
      // Once manually styled, detach from preset-style identity to avoid mixed preset/custom visuals.
      mapStyleVariant: 'custom',
      ...(keepDash ? {} : { lineDasharray: null, transmissionTicks: false }),
    });
  };

  const appearanceBody = (
    <>
      {showSize && (
        <>
          <label className="print-feature-field">
            Width
            <input
              type="number"
              min="10"
              value={selectedPrintElement.width || 80}
              onChange={(e) =>
                updatePrintElement({
                  ...selectedPrintElement,
                  width: Number(e.target.value) || 10,
                })
              }
            />
          </label>
          <label className="print-feature-field">
            Height
            <input
              type="number"
              min="10"
              value={selectedPrintElement.height || 80}
              onChange={(e) =>
                updatePrintElement({
                  ...selectedPrintElement,
                  height: Number(e.target.value) || 10,
                })
              }
            />
          </label>
        </>
      )}

      {caps?.supportsFill && (
        <>
          <label className="print-feature-field">
            {isLogoPoint ? 'Badge background' : 'Fill color'}
            <input
              type="color"
              value={selectedPrintElement.fill || '#ffffff'}
              onChange={(e) => applyAppearancePatch({ fill: e.target.value })}
            />
          </label>
          <OpacitySliderRow
            label={isLogoPoint ? 'Badge opacity' : 'Fill opacity'}
            value={selectedPrintElement.fillOpacity ?? 1}
            onChange={(next) =>
              applyAppearancePatch({
                fillOpacity: Math.max(0, Math.min(1, next)),
              })
            }
          />
          {isLogoPoint && (
            <>
              <label className="print-feature-field">
                Logo color
                <input
                  type="color"
                  value={selectedPrintElement.logoColor || '#111827'}
                  onChange={(e) =>
                    applyAppearancePatch({
                      logoColor: e.target.value,
                    })
                  }
                />
              </label>
              <OpacitySliderRow
                label="Logo opacity"
                value={selectedPrintElement.iconOpacity ?? 1}
                onChange={(next) =>
                  applyAppearancePatch({
                    iconOpacity: Math.max(0, Math.min(1, next)),
                  })
                }
              />
              <label className="print-feature-field">
                Logo size
                <input
                  type="number"
                  min="20"
                  max="100"
                  value={Math.round((selectedPrintElement.iconScale ?? 0.64) * 100)}
                  onChange={(e) =>
                    applyAppearancePatch({
                      iconScale: Math.max(0.2, Math.min(1, (Number(e.target.value) || 64) / 100)),
                    })
                  }
                />
              </label>
            </>
          )}
        </>
      )}

      {caps?.supportsStroke && (
        <>
          <label className="print-feature-field">
            {strokeColorLabel}
            <input
              type="color"
              value={selectedPrintElement.stroke || '#000000'}
              onChange={(e) => applyAppearancePatch({ stroke: e.target.value })}
            />
          </label>
          <label className="print-feature-field">
            {strokeWidthLabel}
            <input
              type="number"
              min="1"
              value={selectedPrintElement.strokeWidth ?? 2}
              onChange={(e) =>
                applyAppearancePatch({
                  strokeWidth: Number(e.target.value) || 1,
                })
              }
            />
          </label>
          <OpacitySliderRow
            label={strokeOpacityLabel}
            value={selectedPrintElement.strokeOpacity ?? 1}
            onChange={(next) =>
              applyAppearancePatch({
                strokeOpacity: Math.max(0, Math.min(1, next)),
              })
            }
          />
        </>
      )}

      {(selectedPrintElement.type === 'polyline' || selectedPrintElement.type === 'arrow') && (
        <label className="print-feature-field">
          Dash pattern
          <input
            type="text"
            placeholder="e.g. 6 4 (empty = solid)"
            value={selectedPrintElement.lineDasharray || ''}
            onChange={(e) =>
              applyAppearancePatch({
                lineDasharray: e.target.value.trim() || null,
              }, { keepDash: true })
            }
          />
        </label>
      )}

      {selectedPrintElement.type === 'shape' &&
        selectedPrintElement.svgKey &&
        svgMap[selectedPrintElement.svgKey] && (
          <div className="print-feature-shape-preview">
            <div className="print-feature-shape-preview-inner">
              {svgMap[selectedPrintElement.svgKey]({
                fill: selectedPrintElement.fill || '#000',
                stroke: selectedPrintElement.stroke || '#000',
                strokeWidth: selectedPrintElement.strokeWidth ?? 1,
                fillOpacity: selectedPrintElement.fillOpacity ?? 1,
                strokeOpacity: selectedPrintElement.strokeOpacity ?? 1,
                iconOpacity: selectedPrintElement.iconOpacity ?? 1,
                iconScale: selectedPrintElement.iconScale ?? 0.64,
                logoColor: selectedPrintElement.logoColor || '#111827',
              })}
            </div>
          </div>
        )}
    </>
  );

  const statsCapable = ['polygon', 'polyline', 'arrow'].includes(selectedPrintElement.type);
  const fontSelectOptions = MAP_LABEL_FONT_OPTIONS.map((o) => (
    <option key={o.value} value={o.value}>
      {o.label}
    </option>
  ));

  const labelAppearanceBody = (
    <>
      <p className="print-feature-subpanel-hint">
        Drag the map label to move it when this feature is selected.
      </p>

      <label className="print-feature-field">
        Map label font
        <select
          value={selectedPrintElement.labelFontFamily || 'Inter, system-ui, sans-serif'}
          onChange={(e) =>
            updatePrintElement({ ...selectedPrintElement, labelFontFamily: e.target.value })
          }
        >
          {fontSelectOptions}
        </select>
      </label>

      <div className="print-feature-field-row">
        <label className="print-feature-field print-feature-field--half">
          Map label size
          <input
            type="number"
            min={8}
            max={32}
            value={selectedPrintElement.labelFontSize ?? 11}
            onChange={(e) =>
              updatePrintElement({
                ...selectedPrintElement,
                labelFontSize: Number(e.target.value) || 11,
              })
            }
          />
        </label>
        <label className="print-feature-field print-feature-field--half">
          Map label text
          <input
            type="color"
            value={selectedPrintElement.labelColor || '#111827'}
            onChange={(e) =>
              updatePrintElement({ ...selectedPrintElement, labelColor: e.target.value })
            }
          />
        </label>
      </div>

      <label className="print-feature-field">
        Map label background
        <input
          type="color"
          value={selectedPrintElement.labelBackgroundColor || '#ffffff'}
          onChange={(e) =>
            updatePrintElement({ ...selectedPrintElement, labelBackgroundColor: e.target.value })
          }
        />
      </label>

      {statsCapable && (
        <label className="print-feature-field print-feature-checkbox">
          <input
            type="checkbox"
            checked={!!selectedPrintElement.labelAttachStats}
            onChange={(e) =>
              updatePrintElement({
                ...selectedPrintElement,
                labelAttachStats: e.target.checked,
              })
            }
          />
          <span className="print-feature-checkbox-label">
            Include area / length / perimeter on the map label (when available)
          </span>
        </label>
      )}

      {selectedPrintElement.type === 'note' && caps?.supportsText && (
        <>
          <p className="print-feature-subheading">Note box — text</p>
          <label className="print-feature-field">
            Horizontal alignment
            <select
              value={selectedPrintElement.textAlign || 'left'}
              onChange={(e) =>
                updatePrintElement({ ...selectedPrintElement, textAlign: e.target.value })
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label className="print-feature-field">
            Vertical alignment
            <select
              value={selectedPrintElement.textVerticalAlign || 'top'}
              onChange={(e) =>
                updatePrintElement({ ...selectedPrintElement, textVerticalAlign: e.target.value })
              }
            >
              <option value="top">Top</option>
              <option value="center">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <label className="print-feature-field">
            Font
            <select
              value={selectedPrintElement.fontFamily || 'Inter, system-ui, sans-serif'}
              onChange={(e) =>
                updatePrintElement({ ...selectedPrintElement, fontFamily: e.target.value })
              }
            >
              {fontSelectOptions}
            </select>
          </label>
          <div className="print-feature-field-row">
            <label className="print-feature-field print-feature-field--half">
              Text color
              <input
                type="color"
                value={selectedPrintElement.fontColor || '#111111'}
                onChange={(e) =>
                  updatePrintElement({ ...selectedPrintElement, fontColor: e.target.value })
                }
              />
            </label>
            <label className="print-feature-field print-feature-field--half">
              Text size
              <input
                type="number"
                min={8}
                max={48}
                value={selectedPrintElement.fontSize ?? 14}
                onChange={(e) =>
                  updatePrintElement({
                    ...selectedPrintElement,
                    fontSize: Number(e.target.value) || 14,
                  })
                }
              />
            </label>
          </div>
          <label className="print-feature-field">
            Note background
            <input
              type="color"
              value={selectedPrintElement.fill || '#ffffff'}
              onChange={(e) =>
                updatePrintElement({
                  ...selectedPrintElement,
                  fill: e.target.value,
                  fillOpacity: 1,
                })
              }
            />
          </label>
        </>
      )}
    </>
  );

  const shapeBadgeRenderer =
    selectedPrintElement.type === 'shape' && selectedPrintElement.svgKey
      ? svgMap[selectedPrintElement.svgKey]
      : null;
  const shapeBadgeDefaults =
    selectedPrintElement.type === 'shape' && selectedPrintElement.svgKey
      ? getPointIconDefaultStyle(selectedPrintElement.svgKey)
      : null;

  const mainView = (
    <>
      <div className="print-feature-rail">
        {shapeBadgeRenderer ? (
          <span className="print-feature-type-badge print-feature-type-badge--shape" title={typeLabel}>
            <span className="print-feature-type-badge-icon" aria-hidden>
              {shapeBadgeRenderer({
                fill: selectedPrintElement.fill ?? shapeBadgeDefaults?.fill ?? '#ffffff',
                stroke: selectedPrintElement.stroke ?? shapeBadgeDefaults?.stroke ?? '#111827',
                strokeWidth: selectedPrintElement.strokeWidth ?? shapeBadgeDefaults?.strokeWidth ?? 3,
                fillOpacity: selectedPrintElement.fillOpacity ?? shapeBadgeDefaults?.fillOpacity ?? 1,
                strokeOpacity:
                  selectedPrintElement.strokeOpacity ?? shapeBadgeDefaults?.strokeOpacity ?? 1,
                logoColor: selectedPrintElement.logoColor ?? shapeBadgeDefaults?.logoColor ?? '#111827',
                iconOpacity: selectedPrintElement.iconOpacity,
                iconScale: selectedPrintElement.iconScale ?? 0.58,
              })}
            </span>
          </span>
        ) : (
          <span className="print-feature-type-badge" title={typeLabel}>
            {(badgeLetter ?? '?').toString().toUpperCase()}
          </span>
        )}
        <label className="print-feature-field print-feature-name-field print-feature-title-field">
          <span className="print-feature-sr-only">Name</span>
          <input
            type="text"
            value={selectedPrintElement.label || ''}
            onChange={(e) =>
              updatePrintElement({ ...selectedPrintElement, label: e.target.value })
            }
            placeholder={`Edit ${typeLabel}`}
            aria-label="Name"
          />
        </label>
        <div className="print-feature-rail-actions">
          <button
            type="button"
            className="print-feature-rail-icon print-feature-rail-icon--danger"
            onClick={handleDelete}
            aria-label="Delete feature"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {onRequestClose && (
            <button
              type="button"
              className="print-feature-rail-icon"
              onClick={onRequestClose}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <label className="print-feature-field print-feature-checkbox print-feature-show-label-row">
        <input
          type="checkbox"
          checked={!!selectedPrintElement.showLabelOnMap}
          onChange={(e) =>
            updatePrintElement({
              ...selectedPrintElement,
              showLabelOnMap: e.target.checked,
            })
          }
        />
        <span className="print-feature-checkbox-label">Show label on map, drag to move</span>
      </label>


      {selectedPrintElement.type === 'note' && caps?.supportsText && (
        <label className="print-feature-field">
          Text
          <textarea
            value={selectedPrintElement.text || ''}
            onChange={(e) =>
              updatePrintElement({ ...selectedPrintElement, text: e.target.value })
            }
            placeholder="Note body"
            rows={4}
          />
        </label>
      )}

      <div
        className={`print-feature-upload-row${photoDropActive ? ' is-drop-active' : ''}${
          photoUploading ? ' is-busy' : ''
        }`}
        tabIndex={0}
        role="button"
        aria-label="Add photos by drag and drop, paste, or file picker"
        onDragEnter={handlePhotoDragEnter}
        onDragLeave={handlePhotoDragLeave}
        onDragOver={handlePhotoDragOver}
        onDrop={handlePhotoDrop}
        onPaste={handlePhotoPaste}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!photoUploading) photoInputRef.current?.click();
          }
        }}
      >
        <div className="print-feature-upload-copy">
          <span className="print-feature-upload-label">Add photo</span>
          <span className="print-feature-upload-hint">
            {photoUploading
              ? 'Uploading…'
              : 'Drop images, paste with ⌘V / Ctrl+V, or browse'}
          </span>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handlePhotoUpload}
          disabled={photoUploading}
          className="print-feature-upload-input"
        />
        <button
          type="button"
          className="print-feature-upload-btn"
          onClick={(event) => {
            event.stopPropagation();
            if (!photoUploading) photoInputRef.current?.click();
          }}
          disabled={photoUploading}
        >
          {photoUploading ? 'Uploading…' : 'Browse'}
        </button>
      </div>
      {photos.length > 0 && (
        <>
          <div className="print-feature-shape-preview print-feature-photo-gallery-hero" style={{ marginTop: 2 }}>
            <button
              type="button"
              className="print-feature-photo-hero-btn"
              onClick={() => setLightboxIndex(0)}
              aria-label="Enlarge photo 1"
            >
              <div className="print-feature-photo-hero-inner">
                <img src={photoEntryToSrc(photos[0])} alt="" className="print-feature-photo-hero-img" draggable={false} />
                <span className="print-feature-photo-hero-hint">Click to enlarge</span>
              </div>
            </button>
          </div>
          {photos.length > 1 && (
            <div className="print-feature-photo-thumb-row">
              {photos.slice(1).map((photo, idx) => (
                <button
                  key={`ph-${idx + 1}`}
                  type="button"
                  className="print-feature-photo-thumb"
                  onClick={() => setLightboxIndex(idx + 1)}
                  aria-label={`Enlarge photo ${idx + 2}`}
                >
                  <img src={photoEntryToSrc(photo)} alt="" draggable={false} />
                </button>
              ))}
            </div>
          )}
          <button type="button" className="print-secondary-button" onClick={handleRemoveAllPhotos}>
            Remove all photos
          </button>
        </>
      )}

      <label className="print-feature-field">
        Notes
        <textarea
          value={selectedPrintElement.description || ''}
          onChange={(e) =>
            updatePrintElement({ ...selectedPrintElement, description: e.target.value })
          }
          placeholder="Add notes"
          rows={3}
        />
      </label>

      {metricsBlock}

      <NavRow onClick={() => setSubPanel('appearance')}>Feature appearance</NavRow>
      <NavRow onClick={() => setSubPanel('label')}>Label appearance / move</NavRow>
    </>
  );

  const subTitle =
    subPanel === 'appearance'
      ? 'Feature appearance'
      : subPanel === 'label'
        ? 'Label appearance / move'
        : '';

  return (
    <div
      className="print-feature-edit-card"
      role="region"
      aria-label="Feature edit"
      onClick={(e) => e.stopPropagation()}
    >
      {subPanel ? (
        <div className="print-feature-subpanel">
          <div className="print-feature-subpanel-header">
            <button
              type="button"
              className="print-feature-back-btn"
              onClick={() => setSubPanel(null)}
              aria-label="Back"
            >
              <BackIcon />
            </button>
            <h2 className="print-feature-subpanel-title">{subTitle}</h2>
          </div>
          <div className="print-feature-subpanel-scroll">
            {subPanel === 'appearance' ? appearanceBody : labelAppearanceBody}
          </div>
        </div>
      ) : (
        <div className="print-feature-main">{mainView}</div>
      )}
      {lightboxIndex !== null &&
        photos[lightboxIndex] &&
        createPortal(
          <div
            className="print-feature-photo-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Photo preview"
          >
            <button
              type="button"
              className="print-feature-photo-lightbox-backdrop"
              aria-label="Close preview"
              onClick={() => setLightboxIndex(null)}
            />
            <div className="print-feature-photo-lightbox-panel">
              <header
                className={
                  photos.length > 1
                    ? 'print-feature-photo-lightbox-header'
                    : 'print-feature-photo-lightbox-header print-feature-photo-lightbox-header-single'
                }
              >
                {photos.length > 1 && (
                  <span className="print-feature-photo-lightbox-count">
                    {lightboxIndex + 1} of {photos.length}
                  </span>
                )}
                <button
                  type="button"
                  className="print-feature-photo-lightbox-close"
                  onClick={() => setLightboxIndex(null)}
                  aria-label="Close"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </header>
              <div className="print-feature-photo-lightbox-stage">
                {photos.length > 1 && (
                  <button
                    type="button"
                    className="print-feature-photo-lightbox-nav print-feature-photo-lightbox-nav-prev"
                    onClick={() =>
                      setLightboxIndex((prev) => (prev <= 0 ? photos.length - 1 : prev - 1))
                    }
                    aria-label="Previous photo"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M15 18l-6-6 6-6"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                <img
                  src={photoEntryToSrc(photos[lightboxIndex])}
                  alt=""
                  className="print-feature-photo-lightbox-img"
                  draggable={false}
                />
                {photos.length > 1 && (
                  <button
                    type="button"
                    className="print-feature-photo-lightbox-nav print-feature-photo-lightbox-nav-next"
                    onClick={() =>
                      setLightboxIndex((prev) => (prev >= photos.length - 1 ? 0 : prev + 1))
                    }
                    aria-label="Next photo"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M9 18l6-6-6-6"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

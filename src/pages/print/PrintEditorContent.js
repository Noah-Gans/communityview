import React, { useMemo, useRef, useState } from 'react';
import './Print.css';
import { svgMap, printCatalogToolIcons } from '../../components/map/printShapes/svgMap';
import { MAP_ELEMENT_CATEGORY, MAP_ELEMENT_ITEMS } from './printCatalog';
import { PrintFlowAccordion } from './PrintFlowAccordion';
import { PrintLineTilePreview, PrintPolygonTilePreview } from './printCatalogTilePreviews';
import { getPointIconDefaultStyle } from './pointIconDefaultStyles';
import {
  PRINT_GALLERY_DRAG_MIME,
  registerPrintGalleryDragPayload,
} from '../../utils/printGalleryDragBuffer';
import { galleryItemToSrc } from '../../utils/mapPhotoStorage';

/** Order for the “All” tab: Points → Lines → Shapes. */
const CATALOG_CATEGORY_ORDER = { point: 0, line: 1, shape: 2 };

function printMapItemLabel(el) {
  if (el?.label && String(el.label).trim()) return String(el.label).trim();
  if (el?.type === 'shape' && el.svgKey) return el.svgKey;
  return el?.type || 'Item';
}

export default function PrintEditorContent({
  currentMapId: _currentMapId,
  activePrintTool,
  setActivePrintTool,
  printBasemapOptions = [],
  currentBasemapId = '',
  onPrintBasemapSelect,
  onOpenLayersTabForPrint,
  /** When true, show Map items + Image gallery in the same column as Basemap / Layers / Map elements (side panel). */
  includePrintTabExtras = false,
  printElements = [],
  updatePrintElement,
  setSelectedPrintElement,
  onZoomToPrintElement,
  deletePrintElement,
  printGalleryItems = [],
  onPrintGalleryUpload,
  onPrintGalleryTransfer,
  printGalleryUploading = false,
}) {
  const [openFlowSection, setOpenFlowSection] = useState('elements');
  const [elementCategory, setElementCategory] = useState(MAP_ELEMENT_CATEGORY.ALL);
  const [galleryDropActive, setGalleryDropActive] = useState(false);
  const galleryDropDepthRef = useRef(0);

  const canTransferGallery = typeof onPrintGalleryTransfer === 'function';

  const handleGalleryDragEnter = (event) => {
    if (!canTransferGallery) return;
    event.preventDefault();
    event.stopPropagation();
    if (printGalleryUploading) return;
    galleryDropDepthRef.current += 1;
    setGalleryDropActive(true);
  };

  const handleGalleryDragLeave = (event) => {
    if (!canTransferGallery) return;
    event.preventDefault();
    event.stopPropagation();
    galleryDropDepthRef.current = Math.max(0, galleryDropDepthRef.current - 1);
    if (galleryDropDepthRef.current === 0) setGalleryDropActive(false);
  };

  const handleGalleryDragOver = (event) => {
    if (!canTransferGallery) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };

  const handleGalleryDrop = async (event) => {
    if (!canTransferGallery) return;
    event.preventDefault();
    event.stopPropagation();
    galleryDropDepthRef.current = 0;
    setGalleryDropActive(false);
    if (printGalleryUploading) return;
    await onPrintGalleryTransfer(event.dataTransfer);
  };

  const handleGalleryPaste = async (event) => {
    if (!canTransferGallery || printGalleryUploading) return;
    const clip = event.clipboardData;
    if (!clip) return;
    const hasImage =
      Array.from(clip.files || []).some((f) => f?.type?.startsWith('image/')) ||
      Array.from(clip.items || []).some((i) => i?.kind === 'file') ||
      /https?:\/\//i.test(String(clip.getData?.('text/plain') || clip.getData?.('text/uri-list') || ''));
    if (!hasImage) return;
    event.preventDefault();
    await onPrintGalleryTransfer(clip);
  };

  const toggleFlowSection = (id) => {
    setOpenFlowSection((prev) => (prev === id ? null : id));
  };

  const filteredCatalog = useMemo(() => {
    let items;
    if (elementCategory === MAP_ELEMENT_CATEGORY.ALL) {
      items = [...MAP_ELEMENT_ITEMS].sort(
        (a, b) => (CATALOG_CATEGORY_ORDER[a.category] ?? 9) - (CATALOG_CATEGORY_ORDER[b.category] ?? 9)
      );
    } else {
      items = MAP_ELEMENT_ITEMS.filter((item) => item.category === elementCategory);
    }
    return items;
  }, [elementCategory]);

  const renderCatalogIcon = (item) => {
    if (item.category === 'line') {
      return <PrintLineTilePreview tool={item.tool} />;
    }
    if (item.category === 'shape') {
      return <PrintPolygonTilePreview tool={item.tool} />;
    }
    if (item.tool.startsWith('shape_')) {
      const svgKey = item.tool.replace('shape_', '');
      const renderer = svgMap[svgKey];
      if (renderer) {
        const s = getPointIconDefaultStyle(svgKey);
        return renderer({
          fill: s?.fill ?? '#ffffff',
          stroke: s?.stroke ?? '#111827',
          strokeWidth: s?.strokeWidth ?? 3,
          fillOpacity: s?.fillOpacity ?? 1,
          strokeOpacity: s?.strokeOpacity ?? 1,
          logoColor: s?.logoColor ?? '#111827',
        });
      }
    }
    if (printCatalogToolIcons[item.tool]) {
      return printCatalogToolIcons[item.tool];
    }
    return <span aria-hidden>{item.icon}</span>;
  };

  const extrasReady =
    includePrintTabExtras &&
    typeof updatePrintElement === 'function' &&
    typeof setSelectedPrintElement === 'function' &&
    typeof onZoomToPrintElement === 'function' &&
    typeof deletePrintElement === 'function' &&
    typeof onPrintGalleryUpload === 'function';

  return (
    <div className="print-sidepanel-content print-landid-flow" data-tour="print-builder-panel">
      <PrintFlowAccordion
        id="basemap"
        title="Basemap"
        isOpen={openFlowSection === 'basemap'}
        onToggle={toggleFlowSection}
        dataTour="print-basemap-panel"
      >
        {printBasemapOptions.length === 0 ? (
          <p className="print-flow-muted">Basemap options load with the map.</p>
        ) : (
          <div className="print-basemap-grid">
            {printBasemapOptions.map((opt) => {
              const active =
                opt.id === 'imagery'
                  ? currentBasemapId === 'imagery' || currentBasemapId === 'imagery-3d'
                  : currentBasemapId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`print-basemap-tile ${active ? 'active' : ''}`}
                  title={opt.label}
                  onClick={() => onPrintBasemapSelect?.(opt.id)}
                >
                  <img
                    src={opt.image}
                    alt=""
                    className="print-basemap-thumb"
                    onError={(e) => {
                      e.target.src = opt.fallback || '/logo192.png';
                    }}
                  />
                  <span className="print-basemap-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="print-flow-hint">Same choices as the basemap control (bottom-right).</p>
      </PrintFlowAccordion>

      <PrintFlowAccordion
        id="layers"
        title="Layers"
        isOpen={openFlowSection === 'layers'}
        onToggle={toggleFlowSection}
        dataTour="print-layers-panel"
      >
        <p className="print-flow-muted">
          Turn data layers on or off in the full layer list (same toggles as the main map).
        </p>
        <button type="button" className="print-secondary-button" onClick={onOpenLayersTabForPrint}>
          Open Layers tab
        </button>
      </PrintFlowAccordion>

      {extrasReady && (
        <PrintFlowAccordion
          id="mapItems"
          title="Map items"
          isOpen={openFlowSection === 'mapItems'}
          onToggle={toggleFlowSection}
        >
          {printElements.length === 0 ? (
            <p className="print-map-items-empty">Nothing on the map yet.</p>
          ) : (
            <ul className="print-map-items-list">
              {[...printElements].reverse().map((el) => (
                <li key={el.id} className="print-map-items-row">
                  <button
                    type="button"
                    className="print-map-items-name"
                    onClick={() => setSelectedPrintElement(el)}
                  >
                    {printMapItemLabel(el)}
                  </button>
                  <button
                    type="button"
                    className="print-map-items-icon-btn"
                    title={el.hiddenOnMap ? 'Show on map' : 'Hide on map'}
                    aria-pressed={el.hiddenOnMap ? false : true}
                    onClick={() => updatePrintElement({ ...el, hiddenOnMap: !el.hiddenOnMap })}
                  >
                    {el.hiddenOnMap ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                        <path
                          fill="currentColor"
                          d="M12 6a9.77 9.77 0 0 1 8.82 5.5 9.647 9.647 0 0 1-2.82 3.24l2.46 2.46-1.41 1.41-18-18 1.41-1.41 3.17 3.17A9.77 9.77 0 0 1 12 6zm-8.82 5.5 1.56 2.74a9.86 9.86 0 0 0 4.68 3.68l-1.42-1.42A7.87 7.87 0 0 1 5.1 12zm8.82-3a3 3 0 0 1 3 3c0 .48-.12.93-.33 1.33l-3.67-3.67c.4-.21.85-.33 1.33-.33zm9.26 3a9.77 9.77 0 0 1-.66 2.6l-3.09-3.09A7.86 7.86 0 0 0 20.82 11.5z"
                        />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                        <path
                          fill="currentColor"
                          d="M12 6a9.77 9.77 0 0 1 8.82 5.5C19.17 14.12 15.79 16 12 16s-7.17-1.88-8.82-4.5A9.77 9.77 0 0 1 12 6zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    className="print-map-items-icon-btn"
                    title="Zoom to item"
                    onClick={() => onZoomToPrintElement(el)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="print-map-items-icon-btn print-map-items-icon-btn--danger"
                    title="Delete from map"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove “${printMapItemLabel(el)}” from the map? This cannot be undone.`
                        )
                      ) {
                        deletePrintElement(el.id);
                      }
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M9 3v1H5v2h14V4h-4V3H9zm-2 4v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7H7zm2 2h2v10H9V9zm4 0h2v10h-2V9z"
                      />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PrintFlowAccordion>
      )}

      {extrasReady && (
        <PrintFlowAccordion
          id="gallery"
          title="Image gallery"
          isOpen={openFlowSection === 'gallery'}
          onToggle={toggleFlowSection}
        >
          <div
            className={`print-gallery-panel-upload${
              galleryDropActive ? ' is-drop-active' : ''
            }${printGalleryUploading ? ' is-busy' : ''}`}
            onDragEnter={handleGalleryDragEnter}
            onDragLeave={handleGalleryDragLeave}
            onDragOver={handleGalleryDragOver}
            onDrop={handleGalleryDrop}
            onPaste={handleGalleryPaste}
            tabIndex={canTransferGallery ? 0 : undefined}
            aria-label={
              canTransferGallery
                ? 'Add images by drag and drop, paste, or file picker'
                : undefined
            }
          >
            <label className="sp-map-button print-gallery-panel-label">
              {printGalleryUploading ? 'Uploading…' : 'Upload images'}
              <input
                type="file"
                accept="image/*"
                multiple
                className="print-gallery-panel-file"
                onChange={onPrintGalleryUpload}
                disabled={printGalleryUploading}
              />
            </label>
            {canTransferGallery && (
              <span className="print-gallery-panel-drop-hint">
                or drop images / paste with ⌘V · Ctrl+V
              </span>
            )}
          </div>
          {printGalleryItems.length > 0 && (
            <>
              <p className="print-gallery-panel-hint">Drag images to the map.</p>
              <ul className="print-gallery-panel-thumbs">
                {printGalleryItems.map((item) => {
                  const src = galleryItemToSrc(item);
                  return (
                    <li key={item.id} className="print-gallery-panel-thumb-wrap">
                      <img
                        src={src}
                        alt={item.name}
                        draggable
                        onDragStart={(e) => {
                          const id = registerPrintGalleryDragPayload({
                            url: src,
                            storagePath: item.storagePath,
                          });
                          if (!id) return;
                          e.dataTransfer.setData(PRINT_GALLERY_DRAG_MIME, id);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        className="print-gallery-panel-thumb"
                        title={item.name}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </PrintFlowAccordion>
      )}

      <PrintFlowAccordion
        id="elements"
        title="Map elements"
        isOpen={openFlowSection === 'elements'}
        onToggle={toggleFlowSection}
        dataTour="print-elements-panel"
      >
        <div className="print-element-categories">
          {[
            { id: MAP_ELEMENT_CATEGORY.ALL, label: 'All' },
            { id: MAP_ELEMENT_CATEGORY.POINT, label: 'Points' },
            { id: MAP_ELEMENT_CATEGORY.LINE, label: 'Lines' },
            { id: MAP_ELEMENT_CATEGORY.SHAPE, label: 'Shapes' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`print-chip ${elementCategory === cat.id ? 'active' : ''}`}
              onClick={() => setElementCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="print-element-grid">
          {filteredCatalog.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`print-element-tile${item.category === 'line' ? ' print-element-tile--line' : ''} ${
                activePrintTool === item.tool ? 'active' : ''
              }`}
              onClick={() => setActivePrintTool(item.tool)}
            >
              <span className="print-element-icon" aria-hidden>
                {renderCatalogIcon(item)}
              </span>
              <span className="print-element-name">{item.label}</span>
            </button>
          ))}
        </div>
      </PrintFlowAccordion>
    </div>
  );
}

import React from 'react';
import { Rnd } from 'react-rnd';

import DraggableLegend from '../../../components/map/printShapes/DraggableLegend';
import DraggableNote from '../../../components/map/printShapes/DraggableNote';
import CompassElement from '../../../components/map/printShapes/CompassElement';
import RectangleElement from '../../../components/map/printShapes/RectangleElement';
import DiamondElement from '../../../components/map/printShapes/Diamond';
import TriangleElement from '../../../components/map/printShapes/Triangle';
import ShapeElement from '../../../components/map/printShapes/ShapeElement';
import PrintMapLabel from '../../../components/map/printShapes/PrintMapLabel';
import { svgMap } from '../../../components/map/printShapes/svgMap';
import PrintFeatureEditPanel from '../../print/PrintFeatureEditPanel';
import PropertyMapWizardBar from '../../print/PropertyMapWizardBar';
import { parsePrintPlacementTool } from '../../print/annotationModel';
import {
  arrowHeadPolygon,
  segmentIndexTowardTip,
  transmissionTickSegments,
} from '../../print/polylineDecorationUtils';
import { buildMapLabelDisplayText, labelUsesGeoOffset } from '../../print/mapLabelUtils';
import { getPointIconDefaultStyle } from '../../print/pointIconDefaultStyles';
import { getMetricsForLineLngLat, getMetricsForPolygonLngLat } from './printToolUtils';
import SharedPhotoFullscreen from '../../../components/map/SharedPhotoFullscreen';

export default function MapPrintOnMapLayer(props) {
  const {
    mapRef,
    isPrinting,
    containerStyle,
    legendItems,
    activePrintTool,
    setActivePrintTool,
    selectedPrintElement,
    setSelectedPrintElement,
    printLayoutMode,
    printLayoutRect,
    setPrintLayoutRect,
    overlayRenderVersion,
    polygonDraftPoints,
    polygonCursorPoint,
    polylineDraftPoints,
    polylineCursorPoint,
    printIconPlaceCursorPx,
    setPrintIconPlaceCursorPx,
    hoveredPrintElementId,
    setHoveredPrintElementId,
    hoveredPrintCursorOverlayPx,
    printElements,
    shareViewerReadOnly,
    updatePrintElement,
    deletePrintElement,
    addPrintElementFromTool,
    shouldRenderPrintElementOnMap,
    handlePrintMapDragOver,
    handlePrintMapDrop,
    getPolygonDraftStyle,
    getPolylineDraftStyle,
    withGeoProjectedFrame,
    syncProjectedEditToGeo,
    getElementAnchorLngLat,
    getElementAnchorScreenPosition,
    isPolygonPlacingTool,
    isPolylinePlacingTool,
    isPrintShapeIconPlacingTool,
    getPrintPixelScale,
    currentSharePhotoElement,
    currentSharePhotoGallery,
    currentSharePhotoCardStyle,
    closeSharePhotoPopup,
    sharePhotoPopupIndex,
    setSharePhotoPopupFullscreen,
    sharePhotoPopupFullscreen,
    stepSharePhotoPopup,
    isPropertyTourRoute,
    propertyMapWizardActive,
    propertyMapWizardIntent,
    layerStatus,
    setLayerStatus,
    printParcelsOverlayVisible,
    setPrintParcelsOverlayVisible,
    selectedFeature,
    isRegridParcelPolygonFeature,
    handlePropertyMapWizardCancel,
    handlePropertyMapWizardContinue,
    propertyMapWizardBusy,
    isPanelOpen,
  } = props;

  return (
    <>
      <div
        className="map-geo-print-stack"
        onDragOver={handlePrintMapDragOver}
        onDrop={handlePrintMapDrop}
      >
        <div
          id="map"
          className={`map ${isPanelOpen ? 'with-panel' : ''}`}
          style={containerStyle}
          onMouseDown={() => {
            if (!isPrinting) return;
            if (activePrintTool && activePrintTool !== 'select') return;
            if (selectedPrintElement) {
              setSelectedPrintElement(null);
            }
          }}
        />

        {isPrinting && printLayoutMode && (
          <div className="print-layout-overlay" aria-hidden>
            {printLayoutRect && (
              <Rnd
                bounds="parent"
                size={{ width: printLayoutRect.width, height: printLayoutRect.height }}
                position={{ x: printLayoutRect.x, y: printLayoutRect.y }}
                style={{ pointerEvents: 'auto', zIndex: 19 }}
                minWidth={220}
                minHeight={160}
                dragHandleClassName="print-layout-selection-box"
                onDragStop={(e, d) =>
                  setPrintLayoutRect((prev) => ({
                    ...(prev || {}),
                    x: d.x,
                    y: d.y,
                    width: prev?.width || 300,
                    height: prev?.height || 220,
                  }))
                }
                onResizeStop={(e, direction, ref, delta, position) =>
                  setPrintLayoutRect({
                    x: position.x,
                    y: position.y,
                    width: parseFloat(ref.style.width),
                    height: parseFloat(ref.style.height),
                  })
                }
              >
                <div className="print-layout-selection-box">
                  <div className="print-layout-selection-label">Print area</div>
                </div>
              </Rnd>
            )}
          </div>
        )}

        {isPrinting && (
          <div
            id="notes-overlay"
            data-render-version={overlayRenderVersion}
            onClick={(e) => {
              if (!mapRef.current) return;
              if (shareViewerReadOnly) return;
              if (!activePrintTool || activePrintTool === 'select') return;
              if (isPolygonPlacingTool(activePrintTool) || isPolylinePlacingTool(activePrintTool)) {
                return;
              }
              const map = mapRef.current;
              const rect = map.getCanvas().getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const lngLat = map.unproject([x, y]);
              addPrintElementFromTool(activePrintTool, {}, { lng: lngLat.lng, lat: lngLat.lat });
              setActivePrintTool('select');
            }}
            onMouseMove={(e) => {
              if (!mapRef.current || !isPrintShapeIconPlacingTool(activePrintTool)) return;
              const rect = mapRef.current.getCanvas().getBoundingClientRect();
              setPrintIconPlaceCursorPx({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            }}
            onMouseLeave={() => setPrintIconPlaceCursorPx(null)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'block',
              pointerEvents:
                activePrintTool &&
                activePrintTool !== 'select' &&
                !isPolygonPlacingTool(activePrintTool) &&
                !isPolylinePlacingTool(activePrintTool)
                  ? 'auto'
                  : 'none',
              zIndex: 6,
            }}
          >
            {isPrinting &&
              isPrintShapeIconPlacingTool(activePrintTool) &&
              printIconPlaceCursorPx &&
              mapRef.current &&
              (() => {
                const s = getPrintPixelScale(mapRef.current);
                if (activePrintTool === 'note') {
                  const w = 220 * s;
                  const h = 120 * s;
                  const fontSize = Math.max(10, 14 * s);
                  return (
                    <div
                      key="print-note-place-preview"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: printIconPlaceCursorPx.x,
                        top: printIconPlaceCursorPx.y,
                        transform: 'translate(-50%, -50%)',
                        width: w,
                        height: h,
                        pointerEvents: 'none',
                        zIndex: 25,
                        opacity: 0.92,
                        background: '#ffffff',
                        border: '1px solid rgba(17, 24, 39, 0.15)',
                        borderRadius: 6,
                        boxSizing: 'border-box',
                        padding: Math.max(6, 8 * s),
                        color: '#111827',
                        fontSize,
                        fontFamily: 'Inter, system-ui, sans-serif',
                        lineHeight: 1.4,
                        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.28)',
                        overflow: 'hidden',
                      }}
                    >
                      Type something…
                    </div>
                  );
                }
                const parsed = parsePrintPlacementTool(activePrintTool);
                const svgKey = parsed.shapeSvgKey;
                if (!svgKey) return null;
                const renderSvg = svgMap[svgKey];
                if (!renderSvg) return null;
                const iconDefaults = getPointIconDefaultStyle(svgKey) || {};
                const baseW = 70;
                const baseH = 70;
                const w = baseW * s;
                const h = baseH * s;
                return (
                  <div
                    key="print-shape-place-preview"
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: printIconPlaceCursorPx.x,
                      top: printIconPlaceCursorPx.y,
                      transform: 'translate(-50%, -50%)',
                      width: w,
                      height: h,
                      pointerEvents: 'none',
                      zIndex: 25,
                      opacity: 0.9,
                      filter: 'drop-shadow(0 2px 8px rgba(15, 23, 42, 0.35))',
                    }}
                  >
                    {renderSvg({
                      fill: iconDefaults.fill ?? '#ffffff',
                      stroke: iconDefaults.stroke ?? '#111827',
                      strokeWidth: iconDefaults.strokeWidth ?? 2.5,
                      fillOpacity: 1,
                      strokeOpacity: 1,
                      iconOpacity: 1,
                      iconScale: 0.64,
                      logoColor: iconDefaults.logoColor ?? '#111827',
                    })}
                  </div>
                );
              })()}
            {isPolygonPlacingTool(activePrintTool) && polygonDraftPoints.length > 0 && (
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
              >
                <polyline
                  points={polygonDraftPoints
                    .map((point) => {
                      const p = mapRef.current.project([point.lng, point.lat]);
                      return `${p.x},${p.y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke={getPolygonDraftStyle().stroke}
                  strokeWidth={getPolygonDraftStyle().strokeWidth || 2}
                  strokeDasharray="6 4"
                />
                {polygonCursorPoint &&
                  (() => {
                    const last = polygonDraftPoints[polygonDraftPoints.length - 1];
                    const first = polygonDraftPoints[0];
                    if (!last) return null;
                    const p = mapRef.current.project([last.lng, last.lat]);
                    const fp = mapRef.current.project([first.lng, first.lat]);
                    return (
                      <>
                        <line
                          x1={p.x}
                          y1={p.y}
                          x2={polygonCursorPoint.x}
                          y2={polygonCursorPoint.y}
                          stroke={getPolygonDraftStyle().stroke}
                          strokeWidth={getPolygonDraftStyle().strokeWidth || 2}
                          strokeDasharray="6 4"
                        />
                        <line
                          x1={polygonCursorPoint.x}
                          y1={polygonCursorPoint.y}
                          x2={fp.x}
                          y2={fp.y}
                          stroke={getPolygonDraftStyle().stroke}
                          strokeWidth={getPolygonDraftStyle().strokeWidth || 2}
                          strokeDasharray="3 3"
                          opacity={0.8}
                        />
                      </>
                    );
                  })()}
              </svg>
            )}

            {isPolylinePlacingTool(activePrintTool) && polylineDraftPoints.length > 0 && (() => {
              const ds = getPolylineDraftStyle();
              const dash =
                ds.lineDasharray === null || ds.lineDasharray === undefined
                  ? undefined
                  : ds.lineDasharray;
              const headMode = activePrintTool === 'arrow' ? 'end' : ds.arrowHead || 'none';
              const screenPts = polylineDraftPoints.map((pt) => {
                const p = mapRef.current.project([pt.lng, pt.lat]);
                return [p.x, p.y];
              });
              const tickSegs =
                ds.transmissionTicks && screenPts.length >= 2
                  ? transmissionTickSegments(screenPts, 20, 6)
                  : [];
              return (
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                  }}
                >
                  {ds.fenceOutlineStroke && (
                    <polyline
                      points={screenPts.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill="none"
                      stroke={ds.fenceOutlineStroke}
                      strokeWidth={ds.fenceOutlineWidth ?? 5}
                      strokeOpacity={ds.fenceOutlineOpacity ?? 0.35}
                      strokeLinecap={ds.strokeLinecap || 'round'}
                      strokeLinejoin="round"
                    />
                  )}
                  <polyline
                    points={screenPts.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke={ds.stroke}
                    strokeWidth={ds.strokeWidth || 2}
                    strokeOpacity={ds.strokeOpacity ?? 1}
                    strokeDasharray={dash}
                    strokeLinecap={ds.strokeLinecap || 'round'}
                    strokeLinejoin="round"
                  />
                  {ds.roadMarkingStroke && (
                    <polyline
                      points={screenPts.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill="none"
                      stroke={ds.roadMarkingStroke}
                      strokeWidth={ds.roadMarkingWidth ?? 2}
                      strokeOpacity={ds.strokeOpacity ?? 1}
                      strokeDasharray={ds.roadMarkingDasharray || undefined}
                      strokeLinecap={ds.roadMarkingLinecap || 'round'}
                      strokeLinejoin="round"
                    />
                  )}
                  {tickSegs.map((t, i) => (
                    <line
                      key={`dtk-${i}`}
                      x1={t.x1}
                      y1={t.y1}
                      x2={t.x2}
                      y2={t.y2}
                      stroke={ds.stroke}
                      strokeWidth={1.2}
                      strokeOpacity={0.9}
                    />
                  ))}
                  {polylineCursorPoint &&
                    (() => {
                      const last = polylineDraftPoints[polylineDraftPoints.length - 1];
                      if (!last) return null;
                      const p = mapRef.current.project([last.lng, last.lat]);
                      const draftStroke = ds.stroke || '#111827';
                      const draftSw = ds.strokeWidth || 2;
                      const x1 = p.x;
                      const y1 = p.y;
                      const x2 = polylineCursorPoint.x;
                      const y2 = polylineCursorPoint.y;
                      const rubberPts =
                        polylineDraftPoints.length >= 2
                          ? [...screenPts, [x2, y2]]
                          : [[x1, y1], [x2, y2]];
                      const rubberTicks =
                        ds.transmissionTicks && rubberPts.length >= 2
                          ? transmissionTickSegments(rubberPts, 20, 6)
                          : [];
                      return (
                        <>
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={draftStroke}
                            strokeOpacity={ds.strokeOpacity ?? 1}
                            strokeWidth={draftSw}
                            strokeDasharray={dash}
                            strokeLinecap={ds.strokeLinecap || 'round'}
                          />
                          {rubberTicks.map((t, i) => (
                            <line
                              key={`dtkr-${i}`}
                              x1={t.x1}
                              y1={t.y1}
                              x2={t.x2}
                              y2={t.y2}
                              stroke={draftStroke}
                              strokeWidth={1.2}
                              strokeOpacity={0.9}
                            />
                          ))}
                          {(headMode === 'end' || headMode === 'both') && (
                            <polygon
                              points={arrowHeadPolygon(x1, y1, x2, y2, draftSw)}
                              fill={draftStroke}
                              fillOpacity={ds.strokeOpacity ?? 1}
                            />
                          )}
                          {headMode === 'both' && polylineDraftPoints.length >= 1 && (() => {
                            const fp = mapRef.current.project([
                              polylineDraftPoints[0].lng,
                              polylineDraftPoints[0].lat,
                            ]);
                            const sec =
                              polylineDraftPoints.length >= 2
                                ? mapRef.current.project([
                                    polylineDraftPoints[1].lng,
                                    polylineDraftPoints[1].lat,
                                  ])
                                : { x: x2, y: y2 };
                            return (
                              <polygon
                                points={arrowHeadPolygon(sec.x, sec.y, fp.x, fp.y, draftSw)}
                                fill={draftStroke}
                                fillOpacity={ds.strokeOpacity ?? 1}
                              />
                            );
                          })()}
                        </>
                      );
                    })()}
                </svg>
              );
            })()}

            {isPolygonPlacingTool(activePrintTool) && polygonDraftPoints.length >= 2 && (() => {
              const metrics = getMetricsForPolygonLngLat(
                polygonCursorPoint
                  ? [...polygonDraftPoints, mapRef.current.unproject([polygonCursorPoint.x, polygonCursorPoint.y])]
                  : polygonDraftPoints
              );
              if (!metrics || !polygonCursorPoint) return null;
              return (
                <div
                  style={{
                    position: 'absolute',
                    top: polygonCursorPoint.y + 12,
                    left: polygonCursorPoint.x + 12,
                    background: 'rgba(15, 23, 42, 0.88)',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    zIndex: 20,
                    pointerEvents: 'none',
                  }}
                >
                  <div>Area: {(metrics.areaSqMeters / 4046.8564224).toFixed(2)} ac</div>
                  <div>Perim: {(metrics.perimeterMeters * 3.28084).toFixed(0)} ft</div>
                </div>
              );
            })()}

            {isPolylinePlacingTool(activePrintTool) && polylineDraftPoints.length >= 1 && (() => {
              if (!polylineCursorPoint) return null;
              const metrics = getMetricsForLineLngLat([
                ...polylineDraftPoints,
                mapRef.current.unproject([polylineCursorPoint.x, polylineCursorPoint.y]),
              ]);
              if (!metrics) return null;
              return (
                <div
                  style={{
                    position: 'absolute',
                    top: polylineCursorPoint.y + 12,
                    left: polylineCursorPoint.x + 12,
                    background: 'rgba(15, 23, 42, 0.88)',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    zIndex: 20,
                    pointerEvents: 'none',
                  }}
                >
                  <div>Length: {(metrics.lengthMeters * 3.28084).toFixed(0)} ft</div>
                </div>
              );
            })()}

            {isPrinting &&
              printElements.map((element) => {
                if (!shouldRenderPrintElementOnMap(element)) return null;
                const projected = withGeoProjectedFrame(element);
                const placingTool = activePrintTool && activePrintTool !== 'select';
                const featurePtr = placingTool ? 'none' : 'auto';
                switch (element.type) {
                  case 'polygon': {
                    const polygonPoints = projected.projectedPolygonPoints || [];
                    const isSelected = selectedPrintElement?.id === element.id;
                    const polygonPointer =
                      (element.mapStyleVariant === 'boundary' || element.label === 'Property Boundary') &&
                      featurePtr === 'auto'
                        ? 'stroke'
                        : featurePtr;
                    const centroid = polygonPoints.length
                      ? polygonPoints.reduce(
                          (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
                          { x: 0, y: 0 }
                        )
                      : { x: 0, y: 0 };
                    const centerX = polygonPoints.length ? centroid.x / polygonPoints.length : 0;
                    const centerY = polygonPoints.length ? centroid.y / polygonPoints.length : 0;
                    return (
                      <svg
                        key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          pointerEvents: 'none',
                          overflow: 'visible',
                          zIndex: 2,
                        }}
                      >
                        <polygon
                          points={polygonPoints
                            .map(([x, y]) => `${x},${y}`)
                            .join(' ')}
                          fill={element.fill || '#10b981'}
                          fillOpacity={element.fillOpacity ?? 0.25}
                          stroke={element.stroke || '#0f5132'}
                          strokeWidth={element.strokeWidth ?? 2}
                          strokeOpacity={element.strokeOpacity ?? 1}
                          strokeDasharray={element.lineDasharray ?? undefined}
                          style={{
                            pointerEvents: polygonPointer,
                            cursor: 'pointer',
                          }}
                          onClick={(evt) => {
                            evt.stopPropagation();
                            setSelectedPrintElement(element);
                          }}
                        />
                        {isSelected && (
                          <g
                            onClick={(evt) => {
                              evt.stopPropagation();
                              deletePrintElement(element.id);
                            }}
                            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                          >
                            <circle cx={centerX} cy={centerY} r={12} fill="#b91c1c" />
                            <text
                              x={centerX}
                              y={centerY + 4}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="14"
                              fontWeight="700"
                            >
                              x
                            </text>
                          </g>
                        )}
                      </svg>
                    );
                  }
                  case 'polyline':
                  case 'arrow': {
                    const linePts = projected.projectedLinePoints || [];
                    if (linePts.length < 2) return null;
                    const headMode = element.type === 'arrow' ? 'end' : element.arrowHead || 'none';
                    const showEndHead = headMode === 'end' || headMode === 'both';
                    const showStartHead = headMode === 'both';
                    const ptsStr = linePts.map(([x, y]) => `${x},${y}`).join(' ');
                    const isSelected = selectedPrintElement?.id === element.id;
                    const bbox = linePts.reduce(
                      (acc, [x, y]) => ({
                        minX: Math.min(acc.minX, x),
                        maxX: Math.max(acc.maxX, x),
                        minY: Math.min(acc.minY, y),
                        maxY: Math.max(acc.maxY, y),
                      }),
                      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
                    );
                    const centerX =
                      linePts.length && Number.isFinite(bbox.minX)
                        ? (bbox.minX + bbox.maxX) / 2
                        : 0;
                    const centerY =
                      linePts.length && Number.isFinite(bbox.minY)
                        ? (bbox.minY + bbox.maxY) / 2
                        : 0;
                    const dash = element.lineDasharray;
                    const strokeCol = element.stroke || (element.type === 'arrow' ? '#d97706' : '#2563eb');
                    const sw = element.strokeWidth ?? 3;
                    const cap = element.strokeLinecap || 'round';
                    const join = element.strokeLinejoin || 'round';
                    const endSeg = showEndHead
                      ? segmentIndexTowardTip(linePts, linePts.length - 1)
                      : null;
                    const startSeg = showStartHead
                      ? segmentIndexTowardTip(linePts, 0)
                      : null;
                    const tickSegs = element.transmissionTicks
                      ? transmissionTickSegments(linePts, 20, 7)
                      : [];
                    return (
                      <svg
                        key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          pointerEvents: 'none',
                          overflow: 'visible',
                          zIndex: 2,
                        }}
                      >
                        <polyline
                          points={ptsStr}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={14}
                          strokeLinecap={cap}
                          strokeLinejoin={join}
                          style={{ pointerEvents: featurePtr, cursor: 'pointer' }}
                          onClick={(evt) => {
                            evt.stopPropagation();
                            setSelectedPrintElement(element);
                          }}
                        />
                        {element.fenceOutlineStroke && (
                          <polyline
                            points={ptsStr}
                            fill="none"
                            stroke={element.fenceOutlineStroke}
                            strokeWidth={element.fenceOutlineWidth ?? 5}
                            strokeOpacity={element.fenceOutlineOpacity ?? 0.35}
                            strokeLinecap={cap}
                            strokeLinejoin={join}
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                        <polyline
                          points={ptsStr}
                          fill="none"
                          stroke={strokeCol}
                          strokeWidth={sw}
                          strokeOpacity={element.strokeOpacity ?? 1}
                          strokeLinecap={cap}
                          strokeLinejoin={join}
                          strokeDasharray={dash || undefined}
                          style={{ pointerEvents: 'none' }}
                        />
                        {element.roadMarkingStroke && (
                          <polyline
                            points={ptsStr}
                            fill="none"
                            stroke={element.roadMarkingStroke}
                            strokeWidth={element.roadMarkingWidth ?? 2}
                            strokeOpacity={element.strokeOpacity ?? 1}
                            strokeLinecap={element.roadMarkingLinecap || 'round'}
                            strokeLinejoin={join}
                            strokeDasharray={element.roadMarkingDasharray || undefined}
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                        {tickSegs.map((t, i) => (
                          <line
                            key={`tx-${element.id}-${i}`}
                            x1={t.x1}
                            y1={t.y1}
                            x2={t.x2}
                            y2={t.y2}
                            stroke={strokeCol}
                            strokeOpacity={element.strokeOpacity ?? 1}
                            strokeWidth={1.25}
                            style={{ pointerEvents: 'none' }}
                          />
                        ))}
                        {endSeg && (
                          <polygon
                            points={arrowHeadPolygon(endSeg.ax1, endSeg.ay1, endSeg.ax2, endSeg.ay2, sw)}
                            fill={strokeCol}
                            fillOpacity={element.strokeOpacity ?? 1}
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                        {startSeg && (
                          <polygon
                            points={arrowHeadPolygon(
                              startSeg.ax1,
                              startSeg.ay1,
                              startSeg.ax2,
                              startSeg.ay2,
                              sw
                            )}
                            fill={strokeCol}
                            fillOpacity={element.strokeOpacity ?? 1}
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                        {isSelected && (
                          <g
                            onClick={(evt) => {
                              evt.stopPropagation();
                              deletePrintElement(element.id);
                            }}
                            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                          >
                            <circle cx={centerX} cy={centerY} r={12} fill="#b91c1c" />
                            <text
                              x={centerX}
                              y={centerY + 4}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="14"
                              fontWeight="700"
                            >
                              x
                            </text>
                          </g>
                        )}
                      </svg>
                    );
                  }
                  case 'note':
                    return (
                      <DraggableNote
                        key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                        note={projected}
                        onNoteChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                        onDelete={deletePrintElement}
                        bounds="#notes-overlay"
                        featurePointerEvents={
                          activePrintTool && activePrintTool !== 'select'
                            ? 'none'
                            : activePrintTool === 'select' && selectedPrintElement?.id !== element.id
                              ? 'none'
                              : 'auto'
                        }
                      />
                    );
                  case 'legend':
                    return (
                      <DraggableLegend
                        key={element.id}
                        element={projected}
                        onPositionChange={(updated) =>
                          updatePrintElement(syncProjectedEditToGeo(updated))
                        }
                        onDelete={() => deletePrintElement(element.id)}
                        featurePointerEvents={
                          activePrintTool && activePrintTool !== 'select'
                            ? 'none'
                            : activePrintTool === 'select' && selectedPrintElement?.id !== element.id
                              ? 'none'
                              : 'auto'
                        }
                      >
                        <h4 style={{ color: 'black' }}>Legend</h4>
                        {legendItems}
                      </DraggableLegend>
                    );
                  case 'compass':
                    return (
                      <CompassElement
                        key={element.id}
                        element={projected}
                        onDelete={deletePrintElement}
                        featurePointerEvents={
                          activePrintTool && activePrintTool !== 'select'
                            ? 'none'
                            : activePrintTool === 'select' && selectedPrintElement?.id !== element.id
                              ? 'none'
                              : 'auto'
                        }
                      />
                    );
                  case 'shape':
                    return (
                      <ShapeElement
                        key={element.id}
                        shape={projected}
                        onDelete={deletePrintElement}
                        onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                        featurePointerEvents={
                          activePrintTool && activePrintTool !== 'select'
                            ? 'none'
                            : activePrintTool === 'select' && selectedPrintElement?.id !== element.id
                              ? 'none'
                              : 'auto'
                        }
                      />
                    );
                  case 'rectangle':
                    return (
                      <RectangleElement
                        key={element.id}
                        shape={projected}
                        onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                        onDelete={deletePrintElement}
                        featurePointerEvents={
                          activePrintTool && activePrintTool !== 'select'
                            ? 'none'
                            : activePrintTool === 'select' && selectedPrintElement?.id !== element.id
                              ? 'none'
                              : 'auto'
                        }
                      />
                    );
                  case 'diamond':
                    return (
                      <DiamondElement
                        key={`${element.id}-${selectedPrintElement?.id ?? 'none'}`}
                        shape={projected}
                        onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                        onDelete={deletePrintElement}
                        featurePointerEvents={
                          activePrintTool && activePrintTool !== 'select'
                            ? 'none'
                            : activePrintTool === 'select' && selectedPrintElement?.id !== element.id
                              ? 'none'
                              : 'auto'
                        }
                      />
                    );
                  case 'triangle':
                    return (
                      <TriangleElement
                        key={element.id}
                        shape={projected}
                        onChange={(updated) => updatePrintElement(syncProjectedEditToGeo(updated))}
                        onDelete={deletePrintElement}
                        featurePointerEvents={
                          activePrintTool && activePrintTool !== 'select'
                            ? 'none'
                            : activePrintTool === 'select' && selectedPrintElement?.id !== element.id
                              ? 'none'
                              : 'auto'
                        }
                      />
                    );
                  default:
                    return null;
                }
              })}

            {isPrinting &&
              printElements.map((element) => {
                if (!shouldRenderPrintElementOnMap(element)) return null;
                const passiveHover =
                  hoveredPrintElementId === element.id && !element.showLabelOnMap;
                const baseLngLat = getElementAnchorLngLat(element);
                let geoAnchor = getElementAnchorScreenPosition(element);
                if (
                  !passiveHover &&
                  labelUsesGeoOffset(element) &&
                  baseLngLat &&
                  mapRef.current
                ) {
                  geoAnchor = mapRef.current.project([
                    baseLngLat.lng + element.labelOffsetDLng,
                    baseLngLat.lat + element.labelOffsetDLat,
                  ]);
                }
                const anchor =
                  passiveHover && hoveredPrintCursorOverlayPx
                    ? hoveredPrintCursorOverlayPx
                    : geoAnchor;
                const labelText = buildMapLabelDisplayText(element);
                const shouldShow =
                  labelText.trim().length > 0 &&
                  (element.showLabelOnMap || hoveredPrintElementId === element.id);
                if (!shouldShow || !anchor) return null;
                const labelSelectable =
                  !shareViewerReadOnly &&
                  (!activePrintTool || activePrintTool === 'select');
                return (
                  <PrintMapLabel
                    key={`lbl-${element.id}`}
                    element={element}
                    anchor={anchor}
                    mapRef={mapRef}
                    labelBaseLngLat={baseLngLat}
                    passiveHover={passiveHover}
                    selected={selectedPrintElement?.id === element.id}
                    selectable={labelSelectable}
                    onSelect={() => setSelectedPrintElement(element)}
                    updatePrintElement={updatePrintElement}
                  />
                );
              })}
          </div>
        )}
      </div>

      {shareViewerReadOnly &&
        currentSharePhotoElement &&
        currentSharePhotoGallery.length > 0 &&
        !sharePhotoPopupFullscreen && (
        <div
          className="shared-photo-card-wrap"
          style={currentSharePhotoCardStyle}
          onMouseEnter={() => setHoveredPrintElementId(null)}
        >
          <article className="shared-photo-card" role="dialog" aria-label="Photo point">
            <header className="shared-photo-card-header">
              <h3 className="shared-photo-card-title">
                {(currentSharePhotoElement.label && String(currentSharePhotoElement.label).trim()) ||
                  'Photo Point'}
              </h3>
              <button
                type="button"
                className="shared-photo-card-close"
                aria-label="Close"
                onClick={closeSharePhotoPopup}
              >
                x
              </button>
            </header>
            <div className="shared-photo-card-image-shell">
              {currentSharePhotoGallery.length > 1 && (
                <>
                  <button
                    type="button"
                    className="shared-photo-card-photo-nav shared-photo-card-photo-nav-prev"
                    aria-label="Previous photo"
                    onClick={() => stepSharePhotoPopup(-1)}
                  >
                    {'<'}
                  </button>
                  <button
                    type="button"
                    className="shared-photo-card-photo-nav shared-photo-card-photo-nav-next"
                    aria-label="Next photo"
                    onClick={() => stepSharePhotoPopup(1)}
                  >
                    {'>'}
                  </button>
                  <span className="shared-photo-card-photo-index" aria-live="polite">
                    {sharePhotoPopupIndex + 1} / {currentSharePhotoGallery.length}
                  </span>
                </>
              )}
              <img
                src={currentSharePhotoGallery[Math.min(sharePhotoPopupIndex, currentSharePhotoGallery.length - 1)]}
                alt={currentSharePhotoElement.label || 'Photo point'}
                className="shared-photo-card-image"
              />
              <button
                type="button"
                className="shared-photo-card-expand"
                aria-label="Open fullscreen gallery"
                onClick={() => setSharePhotoPopupFullscreen(true)}
              >
                ⤢
              </button>
            </div>
          </article>
        </div>
      )}

      {shareViewerReadOnly && currentSharePhotoElement && (
        <SharedPhotoFullscreen
          open={sharePhotoPopupFullscreen && currentSharePhotoGallery.length > 0}
          onClose={() => setSharePhotoPopupFullscreen(false)}
          gallery={currentSharePhotoGallery}
          photoIndex={sharePhotoPopupIndex}
          onStepPhoto={stepSharePhotoPopup}
          alt={currentSharePhotoElement.label || 'Photo point'}
        />
      )}

      {isPrinting && !isPropertyTourRoute && !propertyMapWizardActive && (
        <div
          className={`print-map-top-toolbar${
            shareViewerReadOnly ? ' print-map-top-toolbar--share' : ''
          }`}
        >
          <label
            className={`print-parcels-toggle${
              propertyMapWizardActive ||
              (!shareViewerReadOnly && !layerStatus.ownership)
                ? ' print-parcels-toggle-disabled'
                : ''
            }`}
            title={
              propertyMapWizardActive
                ? 'Parcels stay on while you select boundaries'
                : shareViewerReadOnly
                  ? 'Show or hide parcel outlines (synced with Layers tab)'
                  : !layerStatus.ownership
                    ? 'Turn on Ownership in the Layers tab to show parcels'
                    : 'Show or hide parcel outlines on the map'
            }
          >
            <input
              type="checkbox"
              checked={
                shareViewerReadOnly
                  ? Boolean(layerStatus.ownership)
                  : propertyMapWizardActive ||
                    (Boolean(layerStatus.ownership) && printParcelsOverlayVisible)
              }
              disabled={propertyMapWizardActive || (!shareViewerReadOnly && !layerStatus.ownership)}
              onChange={(e) => {
                if (propertyMapWizardActive) return;
                if (shareViewerReadOnly) {
                  setLayerStatus((prev) => ({
                    ...(prev || {}),
                    ownership: e.target.checked,
                  }));
                  return;
                }
                if (!layerStatus.ownership) return;
                setPrintParcelsOverlayVisible(e.target.checked);
              }}
            />
            <span>Parcels</span>
          </label>
        </div>
      )}

      {isPrinting && propertyMapWizardActive && (
        <PropertyMapWizardBar
          selectedCount={(selectedFeature || []).filter(isRegridParcelPolygonFeature).length}
          isBusy={propertyMapWizardBusy}
          isPanelOpen={isPanelOpen}
          onCancel={handlePropertyMapWizardCancel}
          onContinue={handlePropertyMapWizardContinue}
        />
      )}

      {isPrinting && selectedPrintElement && !shareViewerReadOnly && (
        <div
          className="print-map-feature-edit-wrap"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setHoveredPrintElementId(null)}
        >
          <PrintFeatureEditPanel
            selectedPrintElement={selectedPrintElement}
            updatePrintElement={updatePrintElement}
            deletePrintElement={deletePrintElement}
            onRequestClose={() => setSelectedPrintElement(null)}
          />
        </div>
      )}
    </>
  );
}

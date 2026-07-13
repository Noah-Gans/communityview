import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getSlideMetaForPlanId, isLockedTourSlideIndex } from '../../utils/tourSlidePlan';
import {
  clampTourSearchRadiusMeters,
  milesToTourRadiusMeters,
  TOUR_RADIUS_PRESET_MILES,
  tourRadiusMetersToMiles,
} from '../../utils/tourSettings';

function getPlaceKey(feature) {
  const p = feature?.properties || {};
  return String(p.place_id || p.placeId || p.name || '').trim();
}

function TourEditIntroBody({
  printElements,
  visibleElementIds,
  onToggleElement,
  getElementLabel,
  sectionTitle,
}) {
  const elements = (Array.isArray(printElements) ? printElements : []).filter(
    (el) => el && el.id && !el.hiddenOnMap
  );
  const visibleSet = new Set(Array.isArray(visibleElementIds) ? visibleElementIds : []);

  return (
    <section className="tour-edit-side-panel-body tour-edit-intro-elements">
      {sectionTitle ? <h4 className="tour-edit-section-label">{sectionTitle}</h4> : null}
      {!elements.length ? (
        <p className="tour-edit-panel-status">No map elements on this listing.</p>
      ) : (
        <ul className="tour-edit-element-checklist">
          {elements.map((el) => {
            const id = String(el.id);
            const label = getElementLabel?.(el) || id;
            const visible = visibleSet.has(id);
            return (
              <li key={id} className={visible ? '' : 'is-hidden'}>
                <span className="tour-edit-element-name" title={label}>
                  {label}
                </span>
                <button
                  type="button"
                  className="tour-edit-visibility-btn"
                  aria-pressed={visible}
                  onClick={() => onToggleElement?.(id)}
                >
                  {visible ? 'Hide' : 'Show'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TourEditAmenityBody({
  amenityLabel,
  searchRadiusMeters,
  onRadiusChange,
  onSearch,
  fetchState,
  fetchError,
  features,
  onToggleVisibility,
  onFocusPlace,
  onHoverPlace,
}) {
  const list = Array.isArray(features) ? features : [];
  const isLoading = fetchState === 'loading';
  const hasResults = list.length > 0;
  const searchButtonLabel = isLoading
    ? 'Searching…'
    : hasResults
      ? 'Search again'
      : `Find ${amenityLabel || 'places'}`;

  return (
    <>
      <section className="tour-edit-overview-section tour-edit-amenity-search">
        <h4 className="tour-edit-section-label">Search radius</h4>
        <p className="tour-edit-hint">Blue circle on the map shows the search area.</p>
        <div className="tour-edit-radius-presets">
          {TOUR_RADIUS_PRESET_MILES.map((mi) => {
            const meters = milesToTourRadiusMeters(mi);
            const active = searchRadiusMeters === meters;
            return (
              <button
                key={mi}
                type="button"
                className={`tour-edit-preset-btn${active ? ' is-active' : ''}`}
                onClick={() => onRadiusChange?.(meters)}
              >
                {mi} mi
              </button>
            );
          })}
        </div>
        <label className="tour-edit-slider-label" htmlFor="tour-edit-radius-slider">
          Fine tune: {tourRadiusMetersToMiles(searchRadiusMeters)} mi
        </label>
        <input
          id="tour-edit-radius-slider"
          type="range"
          min={500}
          max={50000}
          step={500}
          value={searchRadiusMeters}
          onChange={(e) => onRadiusChange?.(clampTourSearchRadiusMeters(e.target.value))}
          className="tour-edit-radius-slider"
        />
        <button
          type="button"
          className="tour-edit-primary-btn tour-edit-amenity-search-btn"
          disabled={isLoading}
          onClick={() => onSearch?.()}
        >
          {searchButtonLabel}
        </button>
      </section>

      <div className="tour-edit-amenity-divider" aria-hidden />

      <section className="tour-edit-amenity-results" aria-live="polite">
        <h4 className="tour-edit-section-label">Results</h4>
        {isLoading ? <p className="tour-edit-panel-status">Searching…</p> : null}
        {fetchError ? <p className="tour-edit-panel-error">{fetchError}</p> : null}
        {!list.length && !isLoading && !fetchError ? (
          <p className="tour-edit-panel-status">
            No results yet. Adjust the radius, then tap Find {amenityLabel || 'places'}.
          </p>
        ) : null}
        {list.length > 0 ? (
          <>
            <p className="tour-edit-hint tour-edit-amenity-results-hint">
              Up to 20 results — best matches first.
            </p>
            <ul className="tour-edit-place-list">
              {list.map((f, i) => {
                const p = f?.properties || {};
                const name = String(p.name || '').trim() || `Place ${i + 1}`;
                const hidden = p.tourHidden === true;
                const hKey = getPlaceKey(f);
                const rating = Number(p.rating);
                const dist = String(p.distanceText || '').trim();
                return (
                  <li
                    key={hKey || `${name}-${i}`}
                    className={hidden ? 'is-hidden' : ''}
                    onMouseEnter={() => onHoverPlace?.(hKey)}
                    onMouseLeave={() => onHoverPlace?.(null)}
                  >
                    <button type="button" className="tour-edit-place-main" onClick={() => onFocusPlace?.(f)}>
                      <span className="tour-edit-place-name">{name}</span>
                      <span className="tour-edit-place-meta">
                        {[Number.isFinite(rating) && rating > 0 ? `${rating.toFixed(1)}★` : null, dist]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="tour-edit-visibility-btn"
                      onClick={() => onToggleVisibility?.(f)}
                    >
                      {hidden ? 'Show' : 'Hide'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </section>
    </>
  );
}

/**
 * Shared tour-edit side card — intro map-element toggles or amenity search + results.
 * @param {{ mode: 'intro' | 'amenity' }} props
 */
export function TourEditSidePanel({ mode = 'amenity', slideTitle, ...props }) {
  const isIntro = mode === 'intro';
  const [amenityPanelTab, setAmenityPanelTab] = useState('places');

  useEffect(() => {
    if (!isIntro) setAmenityPanelTab('places');
  }, [isIntro, props.amenityLabel]);

  return (
    <div className={`tour-edit-side-panel tour-edit-side-panel--${mode}`}>
      <header className="tour-edit-panel-header">
        <h3 className="tour-edit-panel-title">
          {isIntro ? 'Map elements' : props.amenityLabel || 'Nearby amenity'}
        </h3>
        <p className="tour-edit-panel-sub">
          {isIntro ? (
            <>Select what is shown for this slide.</>
          ) : (
            <>
              Use the tabs below to choose map elements or search nearby places. Add or remove
              amenity slides with the <strong>+</strong> button in the footer.
            </>
          )}
        </p>
      </header>

      {isIntro ? (
        <TourEditIntroBody
          printElements={props.printElements}
          visibleElementIds={props.visibleElementIds}
          onToggleElement={props.onToggleElement}
          getElementLabel={props.getElementLabel}
        />
      ) : (
        <>
          <div className="tour-edit-side-panel-tabs" role="tablist" aria-label="Amenity slide editor">
            <button
              type="button"
              role="tab"
              id="tour-edit-amenity-tab-elements"
              aria-selected={amenityPanelTab === 'elements'}
              aria-controls="tour-edit-amenity-panel-elements"
              className={`tour-edit-side-panel-tab${
                amenityPanelTab === 'elements' ? ' is-active' : ''
              }`}
              onClick={() => setAmenityPanelTab('elements')}
            >
              Map elements
            </button>
            <button
              type="button"
              role="tab"
              id="tour-edit-amenity-tab-places"
              aria-selected={amenityPanelTab === 'places'}
              aria-controls="tour-edit-amenity-panel-places"
              className={`tour-edit-side-panel-tab${
                amenityPanelTab === 'places' ? ' is-active' : ''
              }`}
              onClick={() => setAmenityPanelTab('places')}
            >
              Places
            </button>
          </div>
          <div className="tour-edit-side-panel-tab-panels">
            <div
              id="tour-edit-amenity-panel-elements"
              role="tabpanel"
              aria-labelledby="tour-edit-amenity-tab-elements"
              className="tour-edit-side-panel-tab-panel"
              hidden={amenityPanelTab !== 'elements'}
            >
              <TourEditIntroBody
                printElements={props.printElements}
                visibleElementIds={props.visibleElementIds}
                onToggleElement={props.onToggleElement}
                getElementLabel={props.getElementLabel}
              />
            </div>
            <div
              id="tour-edit-amenity-panel-places"
              role="tabpanel"
              aria-labelledby="tour-edit-amenity-tab-places"
              className="tour-edit-side-panel-tab-panel tour-edit-amenity-tab-panel"
              hidden={amenityPanelTab !== 'places'}
            >
              <TourEditAmenityBody
                amenityLabel={props.amenityLabel}
                searchRadiusMeters={props.searchRadiusMeters}
                onRadiusChange={props.onRadiusChange}
                onSearch={props.onSearch}
                fetchState={props.fetchState}
                fetchError={props.fetchError}
                features={props.features}
                onToggleVisibility={props.onToggleVisibility}
                onFocusPlace={props.onFocusPlace}
                onHoverPlace={props.onHoverPlace}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** @deprecated Use TourEditSidePanel */
export function TourEditAmenityPanel(props) {
  return <TourEditSidePanel mode="amenity" {...props} />;
}

/** @deprecated Use TourEditSidePanel */
export function TourEditPlaceList(props) {
  return (
    <TourEditSidePanel
      mode="amenity"
      {...props}
      searchRadiusMeters={props.searchRadiusMeters ?? 5000}
      onRadiusChange={props.onRadiusChange ?? (() => {})}
      onSearch={props.onSearch ?? (() => {})}
    />
  );
}

/** @deprecated Use TourEditSidePanel */
export function TourEditRadiusPanel({
  searchRadiusMeters,
  onRadiusChange,
  activeAmenityLabel,
  onSearch,
  fetchState,
}) {
  return (
    <TourEditSidePanel
      mode="amenity"
      amenityLabel={activeAmenityLabel}
      searchRadiusMeters={searchRadiusMeters}
      onRadiusChange={onRadiusChange}
      onSearch={onSearch}
      fetchState={fetchState}
      features={[]}
    />
  );
}

/** @deprecated Use TourEditSidePanel */
export function TourEditIntroElementsPanel(props) {
  return <TourEditSidePanel mode="intro" {...props} />;
}

export function TourEditAddSlideButton({
  availableAmenities,
  availablePhotos,
  onAddAmenity,
  onAddPhoto,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const amenities = Array.isArray(availableAmenities) ? availableAmenities : [];
  const photos = Array.isArray(availablePhotos) ? availablePhotos : [];
  const hasOptions = amenities.length > 0 || photos.length > 0;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="tour-edit-add-slide" ref={rootRef}>
      <button
        type="button"
        className="tour-edit-add-slide-btn"
        aria-label="Add slide"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled || !hasOptions}
        title={hasOptions ? 'Add slide' : 'All slides are already in the tour'}
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      {open && hasOptions ? (
        <div className="tour-edit-add-slide-menu" role="menu">
          {amenities.length > 0 ? (
            <>
              <div className="tour-edit-add-slide-menu-label">Nearby amenities</div>
              <ul className="tour-edit-add-slide-menu-list">
                {amenities.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      role="menuitem"
                      className="tour-edit-add-slide-menu-item"
                      onClick={() => {
                        onAddAmenity?.(item.key);
                        setOpen(false);
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {photos.length > 0 ? (
            <>
              <div className="tour-edit-add-slide-menu-label">Photo slides</div>
              <ul className="tour-edit-add-slide-menu-list">
                {photos.map((row) => (
                  <li key={row.element.id}>
                    <button
                      type="button"
                      role="menuitem"
                      className="tour-edit-add-slide-menu-item"
                      onClick={() => {
                        onAddPhoto?.(row.element.id);
                        setOpen(false);
                      }}
                    >
                      {row.element?.label || 'Photo'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TourEditSlideFooter({
  slidePlan,
  activeIndex,
  tourPhotoRanked,
  onSelectSlide,
  onRemoveSlide,
  onReorderSlides,
  availableAmenities,
  availablePhotos,
  onAddAmenity,
  onAddPhoto,
  disabled,
}) {
  const trackRef = useRef(null);
  const slideRefs = useRef([]);
  const dragFromRef = useRef(null);
  const didInitialCenterRef = useRef(false);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const plan = Array.isArray(slidePlan) ? slidePlan : [];

  const centerActiveSlide = useCallback((behavior = 'smooth') => {
    const track = trackRef.current;
    const tile = slideRefs.current[activeIndex];
    if (!track || !tile) return;
    const trackRect = track.getBoundingClientRect();
    const tileRect = tile.getBoundingClientRect();
    const delta = tileRect.left + tileRect.width / 2 - (trackRect.left + trackRect.width / 2);
    if (Math.abs(delta) > 0.5) {
      track.scrollBy({ left: delta, behavior });
    }
  }, [activeIndex]);

  useLayoutEffect(() => {
    const behavior = didInitialCenterRef.current ? 'smooth' : 'auto';
    didInitialCenterRef.current = true;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => centerActiveSlide(behavior));
    });
    return () => cancelAnimationFrame(id);
  }, [activeIndex, plan, centerActiveSlide]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => centerActiveSlide('auto'));
    ro.observe(track);
    return () => ro.disconnect();
  }, [centerActiveSlide]);

  return (
    <footer className="tour-edit-slide-footer" aria-label="Tour slides">
      <div className="tour-edit-slide-footer-heading">
        <span className="tour-edit-slide-footer-title">Tour slides</span>
        <span className="tour-edit-slide-footer-hint">
          First three slides are fixed · drag to reorder · click × to remove
        </span>
      </div>
      <div className="tour-edit-slide-footer-row">
        <div className="tour-edit-slide-footer-track" ref={trackRef} role="tablist">
          <div className="tour-edit-slide-footer-edge" aria-hidden />
          {plan.map((slideId, index) => {
            const meta = getSlideMetaForPlanId(slideId, { tourPhotoRanked });
            const active = index === activeIndex;
            const dragOver = dragOverIndex === index;
            const locked = isLockedTourSlideIndex(plan, index);
            const canDrag = !disabled && !locked;
            const canRemove = plan.length > 1 && !locked;
            return (
              <div
                key={`${slideId}-${index}`}
                ref={(el) => {
                  slideRefs.current[index] = el;
                }}
                className={`tour-edit-slide-tile tour-edit-slide-tile--${meta.kind}${
                  active ? ' is-active' : ''
                }${dragOver ? ' is-drag-over' : ''}${locked ? ' is-locked' : ''}`}
                draggable={canDrag}
                onDragStart={(e) => {
                  if (!canDrag) {
                    e.preventDefault();
                    return;
                  }
                  dragFromRef.current = index;
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(index));
                }}
                onDragEnd={() => {
                  dragFromRef.current = null;
                  setDragOverIndex(null);
                }}
                onDragOver={(e) => {
                  if (locked) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverIndex(index);
                }}
                onDragLeave={() => setDragOverIndex((prev) => (prev === index ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragFromRef.current;
                  dragFromRef.current = null;
                  setDragOverIndex(null);
                  if (from == null || from === index || locked) return;
                  if (isLockedTourSlideIndex(plan, from)) return;
                  onReorderSlides?.(from, index);
                }}
              >
                {canRemove ? (
                  <button
                    type="button"
                    className="tour-edit-slide-remove"
                    aria-label={`Remove ${meta.label}`}
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSlide?.(slideId, index);
                    }}
                  >
                    ×
                  </button>
                ) : null}
                <button
                  type="button"
                  className="tour-edit-slide-select"
                  role="tab"
                  aria-selected={active}
                  disabled={disabled}
                  onClick={() => onSelectSlide?.(index)}
                  title={meta.label}
                >
                  {!locked ? (
                    <span className="tour-edit-slide-drag-hint" aria-hidden>
                      ⋮⋮
                    </span>
                  ) : (
                    <span className="tour-edit-slide-lock-hint" aria-hidden title="Fixed slide">
                      Lock
                    </span>
                  )}
                  <span className="tour-edit-slide-box-label">{meta.label}</span>
                </button>
              </div>
            );
          })}
          <div className="tour-edit-slide-footer-edge" aria-hidden />
        </div>
        <TourEditAddSlideButton
          availableAmenities={availableAmenities}
          availablePhotos={availablePhotos}
          onAddAmenity={onAddAmenity}
          onAddPhoto={onAddPhoto}
          disabled={disabled}
        />
      </div>
    </footer>
  );
}

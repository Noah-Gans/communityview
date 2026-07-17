import React, { useMemo, useState } from 'react';
import {
  normalizeAgentProfile,
  resolveAgentProfile,
} from '../../utils/agentProfile';
import { extractImageFilesFromDataTransfer } from '../../utils/listingPhotoDrop';

/**
 * Per-map agent contact-card editor (lives in the left edit panel).
 *
 * Toggle between using the owner's account profile and customizing per map.
 * In custom mode, blank fields fall back to the account value, and the headshot
 * / firm logo can be uploaded, pasted, or picked from the image gallery.
 */
export default function AgentProfileEditor({
  value,
  onChange,
  account = {},
  galleryItems = [],
  onUploadImage,
}) {
  const profile = useMemo(() => normalizeAgentProfile(value), [value]);
  const effective = useMemo(
    () => resolveAgentProfile(profile, account),
    [profile, account]
  );
  const canUpload = typeof onUploadImage === 'function';
  const [busyKind, setBusyKind] = useState(null); // 'photoUrl' | 'logoUrl' | null

  const emit = (patch) => {
    if (typeof onChange !== 'function') return;
    onChange({ ...profile, ...patch });
  };

  const setMode = (mode) => emit({ mode });
  const setField = (field) => (e) => emit({ [field]: e.target.value });

  const setImageFromGallery = (kind, item) => {
    const url = item?.url || '';
    if (!url) return;
    if (kind === 'photoUrl') {
      emit({ photoUrl: url, photoStoragePath: item.storagePath || '' });
    } else {
      emit({ logoUrl: url, logoStoragePath: item.storagePath || '' });
    }
  };

  const clearImage = (kind) => {
    if (kind === 'photoUrl') emit({ photoUrl: '', photoStoragePath: '' });
    else emit({ logoUrl: '', logoStoragePath: '' });
  };

  const uploadImageFile = async (kind, file) => {
    if (!canUpload || !file) return;
    setBusyKind(kind);
    try {
      const { url, storagePath } = await onUploadImage(file);
      if (!url) return;
      if (kind === 'photoUrl') emit({ photoUrl: url, photoStoragePath: storagePath || '' });
      else emit({ logoUrl: url, logoStoragePath: storagePath || '' });
    } catch (err) {
      console.error('Agent image upload failed:', err);
      window.alert(err?.message || 'Failed to add image.');
    } finally {
      setBusyKind(null);
    }
  };

  const handleFileInput = (kind) => (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (file) uploadImageFile(kind, file);
  };

  const handlePaste = (kind) => (e) => {
    const files = extractImageFilesFromDataTransfer(e.clipboardData);
    if (files.length) {
      e.preventDefault();
      uploadImageFile(kind, files[0]);
    }
  };

  const isCustom = profile.mode === 'custom';

  const renderImageBlock = (kind, label, hint) => {
    const url = kind === 'photoUrl' ? effective.photoUrl : effective.logoUrl;
    const isSet = kind === 'photoUrl' ? Boolean(profile.photoUrl) : Boolean(profile.logoUrl);
    const busy = busyKind === kind;
    return (
      <div className="agent-card-image-block">
        <div className="agent-card-image-head">
          <span className="agent-card-field-label">{label}</span>
          {isSet ? (
            <button
              type="button"
              className="agent-card-image-clear"
              onClick={() => clearImage(kind)}
            >
              Reset to account
            </button>
          ) : null}
        </div>
        <div
          className={`agent-card-image-row${busy ? ' is-busy' : ''}`}
          onPaste={handlePaste(kind)}
        >
          {url ? (
            <img
              className={`agent-card-image-preview${
                kind === 'logoUrl' ? ' agent-card-image-preview--logo' : ''
              }`}
              src={url}
              alt=""
            />
          ) : (
            <div className="agent-card-image-preview agent-card-image-preview--empty" aria-hidden>
              {kind === 'photoUrl' ? '👤' : '🏢'}
            </div>
          )}
          <div className="agent-card-image-actions">
            <label className="agent-card-upload-btn">
              {busy ? 'Adding…' : 'Upload'}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileInput(kind)}
                disabled={!canUpload || busy}
              />
            </label>
            <span className="agent-card-image-hint">{hint}</span>
          </div>
        </div>
        {galleryItems.length > 0 && (
          <div className="agent-card-gallery-pick">
            {galleryItems.slice(0, 40).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`agent-card-gallery-thumb${
                  isSet && item.url === url ? ' is-selected' : ''
                }`}
                title={item.name || 'Choose'}
                onClick={() => setImageFromGallery(kind, item)}
              >
                <img src={item.url} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="agent-card-editor">
      <p className="agent-card-intro">
        Choose who appears on the shared map &amp; property tour, and what shows to
        the people you send it to.
      </p>

      <div className="agent-card-mode-toggle" role="tablist" aria-label="Agent card source">
        <button
          type="button"
          role="tab"
          aria-selected={!isCustom}
          className={`agent-card-mode-btn${!isCustom ? ' active' : ''}`}
          onClick={() => setMode('account')}
        >
          My account
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isCustom}
          className={`agent-card-mode-btn${isCustom ? ' active' : ''}`}
          onClick={() => setMode('custom')}
        >
          Customize for this map
        </button>
      </div>

      {!isCustom ? (
        <div className="agent-card-account-preview">
          <div className="agent-card-account-row">
            {effective.photoUrl ? (
              <img className="agent-card-account-photo" src={effective.photoUrl} alt="" />
            ) : (
              <div className="agent-card-account-photo agent-card-account-photo--empty" aria-hidden>
                👤
              </div>
            )}
            <div className="agent-card-account-details">
              <div className="agent-card-account-name">
                {effective.name || 'Your name'}
              </div>
              {effective.email ? <div>{effective.email}</div> : null}
              {effective.phone ? <div>{effective.phone}</div> : null}
              {effective.website ? <div>{effective.website}</div> : null}
            </div>
          </div>
          <p className="agent-card-account-note">
            Using your account profile. Edit these defaults in Account settings, or
            choose “Customize for this map” to override them here.
          </p>
        </div>
      ) : (
        <div className="agent-card-custom">
          {renderImageBlock('photoUrl', 'Headshot', 'or paste (⌘V) / pick below')}
          {renderImageBlock('logoUrl', 'Firm logo', 'or paste (⌘V) / pick below')}

          <label className="agent-card-field">
            <span className="agent-card-field-label">Name</span>
            <input
              type="text"
              value={profile.name}
              placeholder={account.name || 'Full name'}
              onChange={setField('name')}
            />
          </label>
          <div className="agent-card-field-2col">
            <label className="agent-card-field">
              <span className="agent-card-field-label">Title</span>
              <input
                type="text"
                value={profile.title}
                placeholder="e.g. Associate Broker"
                onChange={setField('title')}
              />
            </label>
            <label className="agent-card-field">
              <span className="agent-card-field-label">Brokerage</span>
              <input
                type="text"
                value={profile.brokerage}
                placeholder="e.g. Jackson Hole Sotheby’s"
                onChange={setField('brokerage')}
              />
            </label>
          </div>
          <label className="agent-card-field">
            <span className="agent-card-field-label">Email</span>
            <input
              type="email"
              value={profile.email}
              placeholder={account.email || 'you@brokerage.com'}
              onChange={setField('email')}
            />
          </label>
          <label className="agent-card-field">
            <span className="agent-card-field-label">Phone</span>
            <input
              type="tel"
              value={profile.phone}
              placeholder={account.phone || '(555) 555-5555'}
              onChange={setField('phone')}
            />
          </label>
          <label className="agent-card-field">
            <span className="agent-card-field-label">Website</span>
            <input
              type="text"
              value={profile.website}
              placeholder={account.website || 'yoursite.com'}
              onChange={setField('website')}
            />
          </label>
          <p className="agent-card-fallback-note">
            Leave a field blank to fall back to your account profile.
          </p>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase/firebaseConfig';
import { uploadProfileImage } from '../../utils/profileImageUpload';

const normalizeWebsiteUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const ImageUploadField = ({
  id,
  label,
  hint,
  imageUrl,
  variant,
  uploading,
  onFileSelect,
  onRemove,
}) => {
  const inputRef = useRef(null);
  const isLogo = variant === 'logo';

  return (
    <div className={`account-settings-image-field account-settings-image-field--${variant}`}>
      <label className="account-settings-image-label" htmlFor={id}>
        {label}
      </label>
      {hint && <p className="account-settings-image-hint">{hint}</p>}
      <div className="account-settings-image-row">
        <div
          className={`account-settings-image-preview account-settings-image-preview--${variant}${
            imageUrl ? ' has-image' : ''
          }`}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" />
          ) : (
            <span className="account-settings-image-placeholder">
              {isLogo ? 'Logo' : 'Photo'}
            </span>
          )}
        </div>
        <div className="account-settings-image-actions">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="account-settings-image-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="account-settings-btn account-settings-btn--secondary account-settings-btn--inline account-settings-btn--small"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : imageUrl ? 'Replace' : 'Upload'}
          </button>
          {imageUrl && (
            <button
              type="button"
              className="account-settings-btn account-settings-btn--secondary account-settings-btn--inline account-settings-btn--small"
              onClick={onRemove}
              disabled={uploading}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const AccountProfileSettings = ({ user, onProfileUpdated }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactWebsite, setContactWebsite] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [firmLogoUrl, setFirmLogoUrl] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const authEmail = user?.email || '';
  const onProfileUpdatedRef = useRef(onProfileUpdated);
  onProfileUpdatedRef.current = onProfileUpdated;

  const loadProfile = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data();
        const loaded = {
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          contactPhone: data.contactPhone || '',
          contactEmail: data.contactEmail || data.email || authEmail || '',
          contactWebsite: data.contactWebsite || '',
          profilePhotoUrl: data.profilePhotoUrl || '',
          firmLogoUrl: data.firmLogoUrl || '',
        };
        setFirstName(loaded.firstName);
        setLastName(loaded.lastName);
        setContactPhone(loaded.contactPhone);
        setContactEmail(loaded.contactEmail);
        setContactWebsite(loaded.contactWebsite);
        setProfilePhotoUrl(loaded.profilePhotoUrl);
        setFirmLogoUrl(loaded.firmLogoUrl);
        setPhotoPreview(loaded.profilePhotoUrl);
        setLogoPreview(loaded.firmLogoUrl);
        onProfileUpdatedRef.current?.(loaded);
      } else {
        setContactEmail(authEmail);
        onProfileUpdatedRef.current?.({
          firstName: '',
          lastName: '',
          contactPhone: '',
          contactEmail: authEmail,
          contactWebsite: '',
          profilePhotoUrl: '',
          firmLogoUrl: '',
        });
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      setMessage('Could not load profile.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, authEmail]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
      if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    };
  }, [photoPreview, logoPreview]);

  const setPreview = (kind, file) => {
    const url = URL.createObjectURL(file);
    if (kind === 'photo') {
      if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(url);
      setPendingPhotoFile(file);
    } else {
      if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
      setLogoPreview(url);
      setPendingLogoFile(file);
    }
  };

  const handleRemoveImage = (kind) => {
    if (kind === 'photo') {
      if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
      setPhotoPreview('');
      setProfilePhotoUrl('');
      setPendingPhotoFile(null);
    } else {
      if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
      setLogoPreview('');
      setFirmLogoUrl('');
      setPendingLogoFile(null);
    }
  };

  const handleSave = async () => {
    const currentUser = user || auth.currentUser;
    if (!currentUser?.uid) return;

    setSaving(true);
    setMessage('');

    let nextPhotoUrl = profilePhotoUrl;
    let nextLogoUrl = firmLogoUrl;

    try {
      if (pendingPhotoFile) {
        setPhotoUploading(true);
        nextPhotoUrl = await uploadProfileImage(
          currentUser.uid,
          'photo',
          pendingPhotoFile
        );
        setProfilePhotoUrl(nextPhotoUrl);
        if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
        setPhotoPreview(nextPhotoUrl);
        setPendingPhotoFile(null);
      }

      if (pendingLogoFile) {
        setLogoUploading(true);
        nextLogoUrl = await uploadProfileImage(
          currentUser.uid,
          'firm-logo',
          pendingLogoFile
        );
        setFirmLogoUrl(nextLogoUrl);
        if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
        setLogoPreview(nextLogoUrl);
        setPendingLogoFile(null);
      }

      const trimmedEmail = contactEmail.trim();
      const profilePayload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: trimmedEmail,
        contactWebsite: normalizeWebsiteUrl(contactWebsite),
        profilePhotoUrl: nextPhotoUrl || '',
        firmLogoUrl: nextLogoUrl || '',
        updatedAt: new Date(),
      };

      await setDoc(doc(db, 'users', currentUser.uid), profilePayload, { merge: true });

      onProfileUpdatedRef.current?.(profilePayload);
      setMessage('Profile saved.');
    } catch (err) {
      console.error('Failed to save profile:', err);
      setMessage(err.message || 'Could not save profile. Please try again.');
    } finally {
      setSaving(false);
      setPhotoUploading(false);
      setLogoUploading(false);
    }
  };

  if (loading) {
    return <p className="account-settings-muted">Loading profile…</p>;
  }

  return (
    <>
      <p className="account-settings-lead">
        Your name, contact details, and branding for maps and exports.
      </p>

      <div className="account-settings-profile-panel">
        <section className="account-settings-profile-section account-settings-profile-section--photos">
          <h3 className="account-settings-profile-section-title">Photos</h3>
          <ImageUploadField
            id="account-profile-photo"
            label="Profile photo"
            hint="Shown on your account and can be used on shared maps."
            variant="photo"
            imageUrl={photoPreview}
            uploading={photoUploading}
            onFileSelect={(file) => setPreview('photo', file)}
            onRemove={() => handleRemoveImage('photo')}
          />
          <ImageUploadField
            id="account-firm-logo"
            label="Firm logo"
            hint="Used on print exports and shared map footers when no map-specific logo is set."
            variant="logo"
            imageUrl={logoPreview}
            uploading={logoUploading}
            onFileSelect={(file) => setPreview('logo', file)}
            onRemove={() => handleRemoveImage('logo')}
          />
        </section>

        <section className="account-settings-profile-section">
          <h3 className="account-settings-profile-section-title">Name</h3>
          <div className="account-settings-field">
            <label htmlFor="account-first-name">First name</label>
            <input
              id="account-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              autoComplete="given-name"
            />
          </div>
          <div className="account-settings-field">
            <label htmlFor="account-last-name">Last name</label>
            <input
              id="account-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              autoComplete="family-name"
            />
          </div>
        </section>

        <section className="account-settings-profile-section">
          <h3 className="account-settings-profile-section-title">Contact</h3>
          <div className="account-settings-field">
            <label htmlFor="account-contact-email">Contact email</label>
            <input
              id="account-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>
          <div className="account-settings-field">
            <label htmlFor="account-contact-phone">Phone</label>
            <input
              id="account-contact-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="(555) 555-5555"
              autoComplete="tel"
            />
          </div>
          <div className="account-settings-field account-settings-field--last">
            <label htmlFor="account-contact-website">Website</label>
            <input
              id="account-contact-website"
              type="url"
              value={contactWebsite}
              onChange={(e) => setContactWebsite(e.target.value)}
              placeholder="www.yourfirm.com"
              autoComplete="url"
              inputMode="url"
            />
          </div>
          {authEmail && (
            <p className="account-settings-signin-email">
              Sign-in email: <span>{authEmail}</span>
            </p>
          )}
        </section>
      </div>

      {message && (
        <p
          className={`account-settings-feedback ${
            message.includes('saved') ? 'success' : 'error'
          }`}
        >
          {message}
        </p>
      )}
      <button
        type="button"
        className="account-settings-btn account-settings-btn--primary account-settings-btn--inline"
        onClick={handleSave}
        disabled={saving || photoUploading || logoUploading}
      >
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </>
  );
};

export default AccountProfileSettings;

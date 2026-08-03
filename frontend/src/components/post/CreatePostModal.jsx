import { useState, useRef, useCallback } from 'react';
import { postAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../common/Avatar';
import toast from 'react-hot-toast';
import { FiX, FiImage, FiMapPin, FiSmile, FiChevronLeft } from 'react-icons/fi';
import { BsChevronLeft, BsChevronRight } from 'react-icons/bs';

export default function CreatePostModal({ onClose, initialType }) {
  const { user } = useAuth();
  const [step, setStep] = useState('select'); // select | edit | details
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [allowComments, setAllowComments] = useState(true);
  const [hideLikes, setHideLikes] = useState(false);
  const [postType, setPostType] = useState('post');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const isSingleVideo = files.length === 1 && files[0]?.type?.startsWith('video/');

  const handleFiles = useCallback(accepted => {
    if (!accepted.length) return;
    const validFiles = Array.from(accepted).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    ).slice(0, 10);
    if (!validFiles.length) { toast.error('Only images and videos allowed'); return; }
    setFiles(validFiles);
    setPreviews(validFiles.map(f => ({ url: URL.createObjectURL(f), type: f.type.startsWith('video') ? 'video' : 'image', name: f.name })));
    const singleVideo = validFiles.length === 1 && validFiles[0].type.startsWith('video/');
    setPostType(singleVideo && initialType === 'reel' ? 'reel' : 'post');
    setStep('edit');
  }, [initialType]);

  const handleDrop = e => {
    e.preventDefault(); setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleShare = async () => {
    if (!files.length) return;
    setLoading(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('media', f));
      fd.append('caption', caption);
      fd.append('visibility', visibility);
      fd.append('allowComments', String(allowComments));
      fd.append('hideLikeCount', String(hideLikes));
      fd.append('type', postType);
      if (location) fd.append('location', JSON.stringify({ name: location }));
      await postAPI.createPost(fd);
      toast.success('Post shared!');
      onClose();
      setTimeout(() => window.location.reload(), 300);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to share post'); }
    finally { setLoading(false); }
  };

  const goBack = () => {
    if (step === 'details') setStep('edit');
    else if (step === 'edit') { setStep('select'); setFiles([]); setPreviews([]); setPreviewIndex(0); }
    else onClose();
  };

  const stepTitle = { select: 'Create new post', edit: 'Crop', details: 'Create new post' };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-primary)] rounded-2xl shadow-2xl w-full mx-4 animate-scale-in overflow-hidden"
        style={{ maxWidth: step === 'details' ? 860 : 600, maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--border)]">
          <button onClick={goBack} className="p-1 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors">
            {step === 'select' ? <FiX className="w-5 h-5" /> : <FiChevronLeft className="w-5 h-5" />}
          </button>
          <h2 className="font-bold text-sm">{stepTitle[step]}</h2>
          {step === 'edit' && (
            <button onClick={() => setStep('details')} className="text-blue-500 font-bold text-sm hover:text-blue-600">Next</button>
          )}
          {step === 'details' && (
            <button onClick={handleShare} disabled={loading}
              className="text-blue-500 font-bold text-sm hover:text-blue-600 disabled:opacity-50 transition-opacity">
              {loading ? 'Sharing…' : 'Share'}
            </button>
          )}
          {step === 'select' && <div className="w-7" />}
        </div>

        {/* Select media */}
        {step === 'select' && (
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center py-20 px-8 transition-colors cursor-pointer ${isDragging ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
            onClick={() => fileInputRef.current?.click()}>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 transition-colors ${isDragging ? 'bg-blue-100 dark:bg-blue-900' : 'bg-[var(--bg-tertiary)]'}`}>
              <FiImage className="w-10 h-10 text-[var(--text-muted)]" />
            </div>
            <p className="text-xl font-light mb-2 text-center">Drag photos and videos here</p>
            <p className="text-sm text-[var(--text-muted)] mb-6 text-center">Share up to 10 items</p>
            <button className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold pointer-events-none">
              Select from computer
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple
              onChange={e => handleFiles(e.target.files)} className="hidden" />
          </div>
        )}

        {/* Edit / preview */}
        {step === 'edit' && previews.length > 0 && (
          <div className="relative bg-black" style={{ aspectRatio: '1/1', maxHeight: 500 }}>
            {previews[previewIndex]?.type === 'video' ? (
              <video src={previews[previewIndex].url} className="w-full h-full object-contain" controls />
            ) : (
              <img src={previews[previewIndex]?.url} className="w-full h-full object-contain" alt="preview" />
            )}
            {previews.length > 1 && (
              <>
                {previewIndex > 0 && (
                  <button onClick={() => setPreviewIndex(i => i - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow transition-all z-10">
                    <BsChevronLeft className="w-4 h-4 text-black" />
                  </button>
                )}
                {previewIndex < previews.length - 1 && (
                  <button onClick={() => setPreviewIndex(i => i + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow transition-all z-10">
                    <BsChevronRight className="w-4 h-4 text-black" />
                  </button>
                )}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                  {previews.map((_, i) => (
                    <button key={i} onClick={() => setPreviewIndex(i)}
                      className={`rounded-full transition-all ${i === previewIndex ? 'w-2 h-2 bg-white' : 'w-1.5 h-1.5 bg-white/50'}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Details */}
        {step === 'details' && (
          <div className="flex flex-col lg:flex-row overflow-hidden" style={{ maxHeight: 'calc(90vh - 57px)' }}>
            {/* Left: preview */}
            <div className="lg:w-[52%] bg-black flex-shrink-0">
              {previews[0]?.type === 'video' ? (
                <video src={previews[0].url} className="w-full h-full object-contain" style={{ maxHeight: 460 }} />
              ) : (
                <img src={previews[0]?.url} className="w-full h-full object-contain" style={{ maxHeight: 460 }} alt="preview" />
              )}
            </div>

            {/* Right: form */}
            <div className="flex-1 overflow-y-auto">
              {/* User */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
                <Avatar src={user?.avatar} size={30} alt={user?.fullName} />
                <span className="font-semibold text-sm">{user?.username}</span>
              </div>

              {/* Post / Reel toggle */}
              {isSingleVideo && (
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
                  <button type="button" onClick={() => setPostType('post')}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${postType === 'post' ? 'bg-blue-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                    Post
                  </button>
                  <button type="button" onClick={() => setPostType('reel')}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${postType === 'reel' ? 'bg-blue-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                    Reel
                  </button>
                </div>
              )}

              {/* Caption */}
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <textarea value={caption} onChange={e => setCaption(e.target.value)}
                  placeholder="Write a caption…" maxLength={2200} rows={6}
                  className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-[var(--text-muted)] leading-relaxed" />
                <div className="flex items-center justify-between pt-1">
                  <button type="button" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    <FiSmile className="w-5 h-5" />
                  </button>
                  <span className="text-xs text-[var(--text-muted)]">{caption.length} / 2,200</span>
                </div>
              </div>

              {/* Location */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <input value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="Add location" className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" />
                <FiMapPin className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0 ml-2" />
              </div>

              {/* Settings */}
              <div className="divide-y divide-[var(--border)]">
                <div className="px-4 py-3">
                  <p className="text-sm font-medium mb-2">Audience</p>
                  <select value={visibility} onChange={e => setVisibility(e.target.value)}
                    className="w-full bg-transparent text-sm text-[var(--text-secondary)] outline-none cursor-pointer">
                    <option value="public">Everyone</option>
                    <option value="followers">Followers only</option>
                    <option value="closeFriends">Close friends</option>
                    <option value="private">Only me</option>
                  </select>
                </div>

                <label className="flex items-center justify-between px-4 py-3 cursor-pointer">
                  <span className="text-sm">Turn off commenting</span>
                  <ToggleSwitch value={!allowComments} onChange={v => setAllowComments(!v)} />
                </label>

                <label className="flex items-center justify-between px-4 py-3 cursor-pointer">
                  <span className="text-sm">Hide like and view counts</span>
                  <ToggleSwitch value={hideLikes} onChange={setHideLikes} />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleSwitch({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-blue-500' : 'bg-[var(--bg-tertiary)] border border-[var(--border)]'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

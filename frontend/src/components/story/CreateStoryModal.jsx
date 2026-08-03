import { useState, useRef } from 'react';
import { storyAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { FiX, FiCamera } from 'react-icons/fi';

export default function CreateStoryModal({ onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = e => {
    const f = e.target.files[0]; if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!file) return toast.error('Please select a photo or video');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('media', file);
      if (text) fd.append('text', text);
      await storyAPI.createStory(fd);
      toast.success('Story posted!');
      onClose();
      setTimeout(() => window.location.reload(), 300);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to post story'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-bold">Create Story</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {!preview ? (
          <div className="p-8 flex flex-col items-center gap-4">
            <button onClick={() => fileRef.current?.click()}
              className="w-36 h-36 rounded-2xl border-2 border-dashed border-[var(--border)] flex flex-col items-center justify-center gap-3 hover:bg-[var(--bg-tertiary)] hover:border-pink-400 transition-all group">
              <FiCamera className="w-10 h-10 text-[var(--text-muted)] group-hover:text-pink-500 transition-colors" />
              <span className="text-xs text-[var(--text-muted)] text-center">Select photo or video</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleFile} className="hidden" />
          </div>
        ) : (
          <div className="relative">
            {file?.type.startsWith('video')
              ? <video src={preview} className="w-full max-h-96 object-contain bg-black" controls />
              : <img src={preview} className="w-full max-h-96 object-contain bg-black" alt="Story preview" />
            }
            <div className="absolute bottom-4 left-4 right-4">
              <input value={text} onChange={e => setText(e.target.value)} maxLength={200}
                placeholder="Add text to your story…"
                className="w-full bg-black/50 backdrop-blur-sm text-white placeholder:text-white/60 rounded-xl px-3 py-2 text-sm outline-none border border-white/20 focus:border-white/50" />
            </div>
          </div>
        )}

        <div className="flex gap-3 p-4">
          <button onClick={() => { setFile(null); setPreview(null); setText(''); }} className="btn-outline flex-1 rounded-xl text-sm py-2">
            Clear
          </button>
          <button onClick={handleSubmit} disabled={!file || loading} className="btn-primary flex-1 rounded-xl text-sm py-2 disabled:opacity-50">
            {loading ? 'Posting…' : 'Share to story'}
          </button>
        </div>
      </div>
    </div>
  );
}

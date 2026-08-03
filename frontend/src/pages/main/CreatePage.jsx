import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CreatePostModal from '../../components/post/CreatePostModal';

export default function CreatePage() {
  const navigate = useNavigate();
  return <CreatePostModal onClose={() => navigate(-1)} />;
}

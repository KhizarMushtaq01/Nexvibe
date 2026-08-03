import { useNavigate, useLocation } from 'react-router-dom';
import CreatePostModal from '../../components/post/CreatePostModal';

export default function CreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <CreatePostModal
      onClose={() => navigate(-1)}
      initialType={location.state?.intent === 'reel' ? 'reel' : undefined}
    />
  );
}

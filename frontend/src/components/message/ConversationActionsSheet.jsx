import toast from 'react-hot-toast';
import { messageAPI } from '../../services/api';
import { useConfirm } from '../../context/DialogContext';
import ActionSheet from './ActionSheet';

export default function ConversationActionsSheet({ conversation, title, onClose, onUpdate, onDelete }) {
  const confirmDialog = useConfirm();
  const id = conversation._id;
  const isUnread = conversation.unreadCount > 0;

  const actions = [
    {
      label: conversation.folder === 'general' ? 'Move to Primary' : 'Move to General',
      onClick: async () => {
        const nextFolder = conversation.folder === 'general' ? 'primary' : 'general';
        try {
          await messageAPI.setConversationFolder(id, nextFolder);
          onUpdate(id, { folder: nextFolder });
          toast.success(nextFolder === 'general' ? 'Moved to General' : 'Moved to Primary');
          onClose();
        } catch { toast.error('Failed to move conversation'); }
      }
    },
    {
      label: isUnread ? 'Mark as Read' : 'Mark as Unread',
      onClick: async () => {
        const nextUnread = !isUnread;
        try {
          await messageAPI.markConversationUnread(id, nextUnread);
          onUpdate(id, { unreadCount: nextUnread ? Math.max(conversation.unreadCount, 1) : 0 });
          toast.success(nextUnread ? 'Marked as unread' : 'Marked as read');
          onClose();
        } catch { toast.error('Failed to update'); }
      }
    },
    {
      label: conversation.isFlagged ? 'Unflag' : 'Flag',
      onClick: async () => {
        try {
          const { data } = await messageAPI.flagConversation(id);
          onUpdate(id, { isFlagged: data.isFlagged });
          toast.success(data.isFlagged ? 'Flagged' : 'Unflagged');
          onClose();
        } catch { toast.error('Failed to update'); }
      }
    },
    {
      label: 'Delete', danger: true,
      onClick: async () => {
        if (!(await confirmDialog({ message: 'Delete this chat? This cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;
        try {
          await messageAPI.deleteConversation(id);
          onDelete(id);
          toast.success('Chat deleted');
        } catch { toast.error('Failed to delete'); }
      }
    },
    {
      label: conversation.isMuted ? 'Unmute Messages' : 'Mute Messages',
      onClick: async () => {
        try {
          const { data } = await messageAPI.muteConversation(id);
          onUpdate(id, { isMuted: data.isMuted });
          toast.success(data.isMuted ? 'Messages muted' : 'Messages unmuted');
          onClose();
        } catch { toast.error('Failed to update'); }
      }
    },
    {
      label: conversation.isCallMuted ? 'Unmute Call Notifications' : 'Mute Call Notifications',
      onClick: async () => {
        try {
          const { data } = await messageAPI.muteCallNotifications(id);
          onUpdate(id, { isCallMuted: data.isCallMuted });
          toast.success(data.isCallMuted ? 'Call notifications muted' : 'Call notifications unmuted');
          onClose();
        } catch { toast.error('Failed to update'); }
      }
    },
    { label: 'Cancel', onClick: onClose },
  ];

  return <ActionSheet title={title} actions={actions} onClose={onClose} blocking={false} />;
}

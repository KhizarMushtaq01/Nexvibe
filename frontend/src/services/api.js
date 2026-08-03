import axios from 'axios';

const API = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach token
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor - handle 401
API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// AUTH
export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  logout: () => API.post('/auth/logout'),
  getMe: () => API.get('/auth/me'),
  verifyOTP: (data) => API.post('/auth/verify-otp', data),
  resendOTP: (data) => API.post('/auth/resend-otp', data),
  verifyEmail: (token) => API.get(`/auth/verify-email/${token}`),
  forgotPassword: (email) => API.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => API.post(`/auth/reset-password/${token}`, { password }),
  changePassword: (data) => API.put('/auth/change-password', data),
  oauthLogin: (data) => API.post('/auth/oauth', data),
  sendPhoneOTP: (phone) => API.post('/auth/phone-otp', { phone }),
  toggle2FA: (data) => API.post('/auth/2fa/toggle', data),
  request2FAOTP: () => API.post('/auth/2fa/request-otp'),
  getLoginHistory: () => API.get('/auth/login-history'),
};

// USERS
export const userAPI = {
  getProfile: (username) => API.get(`/users/${username}`),
  updateProfile: (data) => API.put('/users/profile', data),
  updateUsername: (username) => API.put('/users/username', { username }),
  updateAvatar: (formData) => API.put('/users/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAvatar: () => API.delete('/users/avatar'),
  updateCover: (formData) => API.put('/users/cover', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  followUser: (id) => API.post(`/users/${id}/follow`),
  blockUser: (id) => API.post(`/users/${id}/block`),
  muteUser: (id) => API.post(`/users/${id}/mute`),
  restrictUser: (id) => API.post(`/users/${id}/restrict`),
  toggleCloseFriend: (id) => API.post(`/users/${id}/close-friend`),
  getFollowers: (id) => API.get(`/users/${id}/followers`),
  getFollowing: (id) => API.get(`/users/${id}/following`),
  getSuggestions: () => API.get('/users/suggestions'),
  getFollowRequests: () => API.get('/users/follow-requests'),
  respondFollowRequest: (id, action) => API.post(`/users/follow-requests/${id}/respond`, { action }),
  removeFollower: (id) => API.delete(`/users/followers/${id}/remove`),
  updatePrivacy: (data) => API.put('/users/settings/privacy', data),
  updateNotifications: (data) => API.put('/users/settings/notifications', data),
  updateAccountType: (type) => API.put('/users/account-type', { accountType: type }),
  deactivate: () => API.post('/users/deactivate'),
  deleteAccount: (password) => API.delete('/users/delete-account', { data: { password } }),
  getBlocked: () => API.get('/users/blocked'),
  requestEmailChange: (newEmail) => API.post('/users/change-email/request', { newEmail }),
  confirmEmailChange: (otp) => API.post('/users/change-email/confirm', { otp }),
};

// POSTS
export const postAPI = {
  getFeed: (page = 1) => API.get(`/posts/feed?page=${page}`),
  getExplore: (page = 1) => API.get(`/posts/explore?page=${page}`),
  getPost: (id) => API.get(`/posts/${id}`),
  getUserPosts: (userId, page = 1, type) => API.get(`/posts/user/${userId}?page=${page}${type ? `&type=${type}` : ''}`),
  createPost: (formData) => API.post('/posts', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updatePost: (id, data) => API.put(`/posts/${id}`, data),
  deletePost: (id) => API.delete(`/posts/${id}`),
  likePost: (id) => API.post(`/posts/${id}/like`),
  savePost: (id) => API.post(`/posts/${id}/save`),
  getSaved: () => API.get('/posts/saved'),
  archivePost: (id) => API.post(`/posts/${id}/archive`),
  getArchived: () => API.get('/posts/archived'),
  pinPost: (id) => API.post(`/posts/${id}/pin`),
  addComment: (id, text) => API.post(`/posts/${id}/comments`, { text }),
  replyToComment: (postId, commentId, text) => API.post(`/posts/${postId}/comments/${commentId}/reply`, { text }),
  deleteComment: (postId, commentId) => API.delete(`/posts/${postId}/comments/${commentId}`),
  likeComment: (postId, commentId) => API.post(`/posts/${postId}/comments/${commentId}/like`),
  pinComment: (postId, commentId) => API.post(`/posts/${postId}/comments/${commentId}/pin`),
  getTrending: () => API.get('/posts/trending'),
  getHashtagPosts: (tag, page = 1) => API.get(`/posts/hashtag/${tag}?page=${page}`),
};

// STORIES
export const storyAPI = {
  getStories: () => API.get('/stories'),
  createStory: (formData) => API.post('/stories', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  viewStory: (id) => API.post(`/stories/${id}/view`),
  replyToStory: (id, text) => API.post(`/stories/${id}/reply`, { text }),
  reactToStory: (id, emoji) => API.post(`/stories/${id}/react`, { emoji }),
  deleteStory: (id) => API.delete(`/stories/${id}`),
  getViewers: (id) => API.get(`/stories/${id}/viewers`),
  archiveStory: (id) => API.post(`/stories/${id}/archive`),
  getArchived: () => API.get('/stories/archived'),
  addToHighlight: (id, data) => API.post(`/stories/${id}/highlight`, data),
};

// MESSAGES
export const messageAPI = {
  getConversations: () => API.get('/messages/conversations'),
  getOrCreate: (participantId) => API.post('/messages/conversations', { participantId }),
  getMessages: (conversationId, page = 1) => API.get(`/messages/conversations/${conversationId}/messages?page=${page}`),
  sendMessage: (conversationId, formData) => API.post(`/messages/conversations/${conversationId}/messages`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteMessage: (messageId, deleteFor = 'me') => API.delete(`/messages/${messageId}?deleteFor=${deleteFor}`),
  reactToMessage: (messageId, emoji) => API.post(`/messages/${messageId}/react`, { emoji }),
  createGroup: (data) => API.post('/messages/groups', data),
  updateGroup: (groupId, data) => API.put(`/messages/groups/${groupId}`, data),
  addMembers: (groupId, userIds) => API.post(`/messages/groups/${groupId}/members`, { userIds }),
  leaveGroup: (groupId) => API.post(`/messages/groups/${groupId}/leave`),
  muteConversation: (id, duration) => API.post(`/messages/conversations/${id}/mute`, { duration }),
  archiveConversation: (id) => API.post(`/messages/conversations/${id}/archive`),
  getUnreadCount: () => API.get('/messages/unread-count'),
};

// NOTIFICATIONS
export const notificationAPI = {
  getAll: (page = 1) => API.get(`/notifications?page=${page}`),
  getUnreadCount: () => API.get('/notifications/unread-count'),
  markAllRead: () => API.post('/notifications/mark-all-read'),
  markRead: (id) => API.put(`/notifications/${id}/read`),
  delete: (id) => API.delete(`/notifications/${id}`),
  clearAll: () => API.post('/notifications/clear'),
};

// SEARCH
export const searchAPI = {
  search: (q, type = 'all', page = 1) => API.get(`/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}`),
  getSuggestions: (q) => API.get(`/search/suggestions?q=${encodeURIComponent(q)}`),
};

// REELS
export const reelAPI = {
  getFeed: (page = 1) => API.get(`/reels/feed?page=${page}`),
  createReel: (formData) => API.post('/reels', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// ADMIN
export const adminAPI = {
  getDashboard: () => API.get('/admin/dashboard'),
  getUsers: (params) => API.get('/admin/users', { params }),
  getUser: (id) => API.get(`/admin/users/${id}`),
  banUser: (id, data) => API.post(`/admin/users/${id}/ban`, data),
  unbanUser: (id) => API.post(`/admin/users/${id}/unban`),
  verifyUser: (id) => API.post(`/admin/users/${id}/verify`),
  changeRole: (id, role) => API.put(`/admin/users/${id}/role`, { role }),
  deleteUser: (id) => API.delete(`/admin/users/${id}`),
  getPosts: (params) => API.get('/admin/posts', { params }),
  deletePost: (id) => API.delete(`/admin/posts/${id}`),
  sendNotification: (data) => API.post('/admin/notifications/send', data),
};

export default API;

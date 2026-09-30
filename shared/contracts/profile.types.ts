export interface PublicProfile {
  id: string;
  username: string;
}

export interface UserProfile extends PublicProfile {
  email: string;
}
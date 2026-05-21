import { User } from '~/models';
import { Types } from 'mongoose';

export const getUserByQuery = async (query: Record<string, any>) => {
  try {
    const user = await User.findOne(query);
    return user || undefined;
  } catch {
    return undefined;
  }
};

export const getUserById = async (id?: Types.ObjectId | string) => {
  if (!id) return undefined;
  return await getUserByQuery({ _id: id });
};

export const getUserByDeviceId = async (deviceId?: string) => {
  if (!deviceId) return undefined;
  return await getUserByQuery({ deviceId });
};

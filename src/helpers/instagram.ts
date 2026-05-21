import { IUser } from '~/models';

import { IAppConf } from '~/models/app_conf';

function arePrivateProfilesAllowed({
  appConf,
  user,
}: {
  appConf: IAppConf;
  user: IUser;
}) {
  return Boolean(appConf.allowPrivateProfiles || user.isInternal);
}

export { arePrivateProfilesAllowed };

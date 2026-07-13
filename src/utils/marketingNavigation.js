/** Pass on navigate('/') so AuthGuard allows the marketing home page. */
export const STAY_ON_HOME_STATE = { stayOnHome: true };

export function navigateToMarketingHome(navigate) {
  navigate('/', { state: STAY_ON_HOME_STATE });
}

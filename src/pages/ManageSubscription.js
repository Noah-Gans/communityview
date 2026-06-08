import { Navigate } from 'react-router-dom';

/** Legacy route — opens account settings on the Subscription tab. */
const ManageSubscription = () => (
  <Navigate to="/map?accountSection=subscription" replace />
);

export default ManageSubscription;

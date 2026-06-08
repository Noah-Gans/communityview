import React from 'react';
import { Navigate } from 'react-router-dom';
import TierGate from '../../components/auth/TierGate';
import { REGRID_BATCH_REPORTS_ENABLED } from '../../config/featureFlags';
import ReportRegridBatch from './ReportRegridBatch';

/**
 * Reports route entry. Launch build keeps batch code in ReportRegridBatch.js
 * but does not mount it unless REACT_APP_ENABLE_REGRID_BATCH_REPORTS=true.
 */
const Report = () => {
  if (!REGRID_BATCH_REPORTS_ENABLED) {
    return <Navigate to="/map" replace />;
  }
  return (
    <TierGate requiredTier="plus">
      <ReportRegridBatch />
    </TierGate>
  );
};

export default Report;

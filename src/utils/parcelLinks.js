// Utility for constructing parcel-related links based on county and result fields

const COUNTY_LINK_CONFIG = {
  teton_county_wy: {
    property_details: {
      base_url: "https://gis.tetoncountywy.gov/portal/apps/dashboards/ca93f7b7ae3e4d51ad371121a64ee739#accountno=",
      field: "property_details_key"
    },
    clerk_records: {
      base_url: "https://gis.tetoncountywy.gov/portal/apps/dashboards/03ef10d8b8634909b6263e9016bcc986#statepin=",
      field: "clerk_records_key"
    },
    tax_details: {
      base_url: "https://gis.tetoncountywy.gov/portal/apps/dashboards/5574848e46464109a14dead33e5ddace#ParcelInfo=",
      field: "tax_details_key"
    }
  },
  teton_county_id: {}, // No links provided
  lincoln_county_wy: {
    property_details: {
      base_url: "https://propertydetails.lcwy.org/Home/Detail/",
      field: "property_details_key"
    },
    tax_details: {
      base_url: "https://itax.tylertech.com/LincolnWY/detail.aspx?taxid=",
      field: "tax_details_key"
    },
    clerk_records: {
      static_url: "https://idocmarket.com/Subscription/Subscribe?county=LINWY1"
    }
  },
  sublette_county_wy: {
    property_details: {
      base_url: "https://maps.terragis.net/sublette/mapserver/tabDetail.php?v=2&accountno=",
      field: "property_details_key"
    },
    tax_details: {
      base_url: "https://maps.terragis.net/sublette/treas/query/search.php?Tax_ID=",
      field: "tax_details_key"
    },
    clerk_records: {
      base_url: "https://maps.terragis.net/sublette/clerk/query/list.php?pidn=",
      field: "clerk_records_key"
    }
  },
  fremont_county_wy: {
    property_details: {
      base_url: "https://maps.terragis.net/fremontwy/tabDetail.php?v=2&accountno=",
      field: "property_details_key"
    },
    tax_details: {
      base_url: "https://itax.tylertech.com/FremontWY/detail.aspx?taxid=",
      field: "tax_details_key"
    },
    clerk_records: {
      static_url: "https://fremontcountywy-recorder.tylerhost.net/recorder/eagleweb/docSearch.jsp"
    }
  }
};

// Only map legacy fields if needed (for now, all use *_key, so mapping is not needed)
export function prepareParcelLinkFields(result, countyCode) {
  return { ...result };
}

export function getParcelLinks(result, countyCode) {
  // Prepare the result with legacy fields for link construction
  const mappedResult = prepareParcelLinkFields(result, countyCode);
  const config = COUNTY_LINK_CONFIG[countyCode] || {};
  const links = {};

  // Property Details
  if (config.property_details) {
    if (config.property_details.base_url && mappedResult[config.property_details.field]) {
      links.propertyDetails = config.property_details.base_url + mappedResult[config.property_details.field];
    }
  }

  // Tax Details
  if (config.tax_details) {
    if (config.tax_details.base_url && mappedResult[config.tax_details.field]) {
      let taxKey = mappedResult[config.tax_details.field];
      if (countyCode === 'lincoln_county_wy') {
        taxKey = '00' + taxKey;
      }
      links.taxDetails = config.tax_details.base_url + taxKey;
    }
  }

  // Clerk Records
  if (config.clerk_records) {
    if (config.clerk_records.static_url) {
      links.clerkRecords = config.clerk_records.static_url;
    } else if (config.clerk_records.base_url && mappedResult[config.clerk_records.field]) {
      links.clerkRecords = config.clerk_records.base_url + mappedResult[config.clerk_records.field];
    }
  }

  return links;
}

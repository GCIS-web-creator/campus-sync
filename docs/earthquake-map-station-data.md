# Earthquake map station locations

CampusSync uses the Japan Meteorological Agency (JMA) list of seismic-intensity observation stations to place individual observation markers at their actual coordinates for every reported intensity (1 through 7).

## JMA source and attribution

- Original data: Japan Meteorological Agency, "List of seismic intensity stations (code_p.zip)"  
  https://www.data.jma.go.jp/eqev/data/bulletin/shindo_e.html
- Bundled JSON: compact conversion of the JMA `code_p.csv` station list (7,258 rows, October 2026 distribution) published in `shiwaku/jma-earthquake-data-converter`:  
  https://github.com/shiwaku/jma-earthquake-data-converter/blob/main/data/code_p.csv
- The converter repository identifies the source data as CC BY 4.0. This project retains the source attribution and station observation-period fields.

## Matching rules

The map matches each JMA observation station display name to the station-list name and verifies that the earthquake event timestamp falls within that station's active period. It does not fabricate coordinates. If a name is ambiguous or no active-period entry matches, the point is not placed at an invented position; the map reports the number of observation records versus successfully geocoded points and retains the municipality-level fallback marker.

At medium and detailed zooms, all geocoded station observations (intensity 1–7) are drawn. At wider zooms, observations are aggregated into regional maximum-intensity labels to avoid excessive overlap.

## Complete observation data

The JMA XML parser stores all observed municipalities and all station records in each municipality. It must not truncate the observation arrays to a fixed number of rows. The event-detail endpoint re-fetches the latest `VXSE53` XML from the trusted JMA host and refreshes the stored observation list.

The location list is cached by the browser. Refresh the deployed site after a new release to use an updated copy.

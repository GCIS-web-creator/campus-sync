# Earthquake map station locations

CampusSync uses the JMA list of seismic-intensity observation stations to place station-level intensity-1 markers at their actual locations.

## Source and attribution

- Original data: Japan Meteorological Agency, "List of seismic intensity stations (code_p.zip)"  
  https://www.data.jma.go.jp/eqev/data/bulletin/shindo_e.html
- The bundled JSON is a compact conversion of the JMA `code_p.csv` station list (7,258 rows, October 2026 distribution) published in the `shiwaku/jma-earthquake-data-converter` repository:
  https://github.com/shiwaku/jma-earthquake-data-converter/blob/main/data/code_p.csv
- The converter repository identifies the source data as CC BY 4.0. This project retains the source attribution and station observation-period fields.

The map matches JMA station display names to station-list names and verifies the event timestamp falls within the station's active period. It does not fabricate station coordinates. If a station name is ambiguous or has no matching active-period record, no exact-location station marker is drawn for it; the displayed "map pins" count makes that difference visible.

The location list is cached by the browser. Refresh the deployed site after a new release to use an updated copy.

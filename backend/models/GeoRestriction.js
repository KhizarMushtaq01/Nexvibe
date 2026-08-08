import mongoose from 'mongoose';

// Single-document settings collection -- there is intentionally only ever
// one GeoRestriction document. getSettings()/updateGeoRestriction() in
// utils/geoRestriction.js and adminController.js treat it that way.
const geoRestrictionSchema = new mongoose.Schema({
  mode: { type: String, enum: ['allow_all', 'whitelist', 'blacklist'], default: 'allow_all' },
  // ISO 3166-1 alpha-2 codes, e.g. ['US', 'PK']. Meaning depends on `mode`;
  // ignored entirely when mode is 'allow_all'.
  countries: [{ type: String, uppercase: true, trim: true }],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const GeoRestriction = mongoose.model('GeoRestriction', geoRestrictionSchema);
export default GeoRestriction;

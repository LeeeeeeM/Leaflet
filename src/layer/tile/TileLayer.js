import {GridLayer} from './GridLayer.js';
import Browser from '../../core/Browser.js';
import * as Util from '../../core/Util.js';
import * as DomEvent from '../../dom/DomEvent.js';

/*
 * @class TileLayer
 * @inherits GridLayer
 * Used to load and display tile layers on the map. Note that most tile servers require attribution, which you can set under `Layer`. Extends `GridLayer`.
 *
 * @example
 *
 * ```js
 * new TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png?{foo}', {foo: 'bar', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
 * ```
 *
 * @section URL template
 * @example
 *
 * A string of the following form:
 *
 * ```
 * 'https://{s}.somedomain.com/blabla/{z}/{x}/{y}{r}.png'
 * ```
 *
 * `{s}` means one of the available subdomains (used sequentially to help with browser parallel requests per domain limitation; subdomain values are specified in options; `a`, `b` or `c` by default, can be omitted), `{z}` — zoom level, `{x}` and `{y}` — tile coordinates. `{r}` can be used to add "&commat;2x" to the URL to load retina tiles.
 *
 * You can use custom keys in the template, which will be [evaluated](#util-template) from TileLayer options, like this:
 *
 * ```
 * new TileLayer('https://{s}.somedomain.com/{foo}/{z}/{x}/{y}.png', {foo: 'bar'});
 * ```
 */

// @constructor TileLayer(urlTemplate: String, options?: TileLayer options)
// Instantiates a tile layer object given a `URL template` and optionally an options object.
export class TileLayer extends GridLayer {

	static {
		// @section
		// @aka TileLayer options
		this.setDefaultOptions({
			// @option minZoom: Number = 0
			// The minimum zoom level down to which this layer will be displayed (inclusive).
			minZoom: 0,

			// @option maxZoom: Number = 18
			// The maximum zoom level up to which this layer will be displayed (inclusive).
			maxZoom: 18,

			// @option subdomains: String|String[] = 'abc'
			// Subdomains of the tile service. Can be passed in the form of one string (where each letter is a subdomain name) or an array of strings.
			subdomains: 'abc',

			// @option errorTileUrl: String = ''
			// URL to the tile image to show in place of the tile that failed to load.
			errorTileUrl: '',

			// @option zoomOffset: Number = 0
			// The zoom number used in tile URLs will be offset with this value.
			zoomOffset: 0,

			// @option tms: Boolean = false
			// If `true`, inverses Y axis numbering for tiles (turn this on for [TMS](https://en.wikipedia.org/wiki/Tile_Map_Service) services).
			tms: false,

			// @option zoomReverse: Boolean = false
			// If set to true, the zoom number used in tile URLs will be reversed (`maxZoom - zoom` instead of `zoom`)
			zoomReverse: false,

			// @option detectRetina: Boolean = false
			// If `true` and user is on a retina display, it will request four tiles of half the specified size and a bigger zoom level in place of one to utilize the high resolution.
			detectRetina: false,

			// @option crossOrigin: Boolean|String = false
			// Whether the crossOrigin attribute will be added to the tiles.
			// If a String is provided, all tiles will have their crossOrigin attribute set to the String provided. This is needed if you want to access tile pixel data.
			// Refer to [CORS Settings](https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_settings_attributes) for valid String values.
			crossOrigin: false,

			// @option referrerPolicy: Boolean|String = false
			// Whether the referrerPolicy attribute will be added to the tiles.
			// If a String is provided, all tiles will have their referrerPolicy attribute set to the String provided.
			// This may be needed if your map's rendering context has a strict default but your tile provider expects a valid referrer
			// (e.g. to validate an API token).
			// Refer to [HTMLImageElement.referrerPolicy](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/referrerPolicy) for valid String values.
			referrerPolicy: false
		});
	}

	initialize(url, options) {

		this._url = url;

		options = Util.setOptions(this, options);

		// in case the attribution hasn't been specified, check for known hosts that require attribution
		if (options.attribution === null && URL.canParse(url)) {
			const urlHostname = new URL(url).hostname;

			// check for Open Street Map hosts
			const osmHosts = ['tile.openstreetmap.org', 'tile.osm.org'];
			if (osmHosts.some(host => urlHostname.endsWith(host))) {
				options.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
			}
		}

		// detecting retina displays, adjusting tileSize and zoom levels
		if (options.detectRetina && Browser.retina && options.maxZoom > 0) {

			options.tileSize = Math.floor(options.tileSize / 2);

			if (!options.zoomReverse) {
				options.zoomOffset++;
				options.maxZoom = Math.max(options.minZoom, options.maxZoom - 1);
			} else {
				options.zoomOffset--;
				options.minZoom = Math.min(options.maxZoom, options.minZoom + 1);
			}

			options.minZoom = Math.max(0, options.minZoom);
		} else if (!options.zoomReverse) {
			// make sure maxZoom is gte minZoom
			options.maxZoom = Math.max(options.minZoom, options.maxZoom);
		} else {
			// make sure minZoom is lte maxZoom
			options.minZoom = Math.min(options.maxZoom, options.minZoom);
		}

		if (typeof options.subdomains === 'string') {
			options.subdomains = options.subdomains.split('');
		}

		this.on('tileunload', this._onTileRemove);
	}

	// @method setUrl(url: String, noRedraw?: Boolean): this
	// Updates the layer's URL template and redraws it (unless `noRedraw` is set to `true`).
	// If the URL does not change, the layer will not be redrawn unless
	// the noRedraw parameter is set to false.
	setUrl(url, noRedraw) {
		if (this._url === url && noRedraw === undefined) {
			noRedraw = true;
		}

		this._url = url;

		if (!noRedraw) {
			this.redraw();
		}
		return this;
	}

	// @method createTile(coords: Object, done?: Function): HTMLElement
	// Called only internally, overrides GridLayer's [`createTile()`](#gridlayer-createtile)
	// to return an `<img>` HTML element with the appropriate image URL given `coords`. The `done`
	// callback is called when the tile has been loaded.
	createTile(coords, done) {
		const tile = document.createElement('img');

		DomEvent.on(tile, 'load', this._tileOnLoad.bind(this, done, tile));
		DomEvent.on(tile, 'error', this._tileOnError.bind(this, done, tile));

		if (this.options.crossOrigin || this.options.crossOrigin === '') {
			tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
		}

		// for this new option we follow the documented behavior
		// more closely by only setting the property when string
		if (typeof this.options.referrerPolicy === 'string') {
			tile.referrerPolicy = this.options.referrerPolicy;
		}

		// The alt attribute is set to the empty string,
		// allowing screen readers to ignore the decorative image tiles.
		// https://www.w3.org/WAI/tutorials/images/decorative/
		// https://www.w3.org/TR/html-aria/#el-img-empty-alt
		tile.alt = '';

		tile.src = this.getTileUrl(coords);

		return tile;
	}

	// @section Extension methods
	// @uninheritable
	// Layers extending `TileLayer` might reimplement the following method.
	// @method getTileUrl(coords: Object): String
	// Called only internally, returns the URL for a tile given its coordinates.
	// Classes extending `TileLayer` can override this function to provide custom tile URL naming schemes.
	getTileUrl(coords) {
		const data = Object.create(this.options);
		Object.assign(data, {
			r: Browser.retina ? '@2x' : '',
			s: this._getSubdomain(coords),
			x: coords.x,
			y: coords.y,
			z: this._getZoomForUrl()
		});
		if (this._map && !this._map.options.crs.infinite) {
			const invertedY = this._globalTileRange.max.y - coords.y;
			if (this.options.tms) {
				data['y'] = invertedY;
			}
			data['-y'] = invertedY;
		}

		return Util.template(this._url, data);
	}

	_tileOnLoad(done, tile) {
		done(null, tile);
	}

	_tileOnError(done, tile, e) {
		const errorUrl = this.options.errorTileUrl;
		if (errorUrl && tile.getAttribute('src') !== errorUrl) {
			tile.src = errorUrl;
		}
		done(e, tile);
	}

	_onTileRemove(e) {
		e.tile.onload = null;
	}

	_getZoomForUrl() {
		let zoom = this._tileZoom;
		const maxZoom = this.options.maxZoom,
		zoomReverse = this.options.zoomReverse,
		zoomOffset = this.options.zoomOffset;

		if (zoomReverse) {
			zoom = maxZoom - zoom;
		}

		return zoom + zoomOffset;
	}

	_getSubdomain(tilePoint) {
		const index = Math.abs(tilePoint.x + tilePoint.y) % this.options.subdomains.length;
		return this.options.subdomains[index];
	}

	// stops loading all tiles in the background layer
	_abortLoading() {
		let i, tile;
		for (i of Object.keys(this._tiles)) {
			if (this._tiles[i].coords.z !== this._tileZoom) {
				tile = this._tiles[i].el;

				tile.onload = Util.falseFn;
				tile.onerror = Util.falseFn;

				if (!tile.complete) {
					tile.src = Util.emptyImageUrl;
					const coords = this._tiles[i].coords;
					tile.remove();
					delete this._tiles[i];
					// @event tileabort: TileEvent
					// Fired when a tile was loading but is now not wanted.
					this.fire('tileabort', {
						tile,
						coords
					});
				}
			}
		}
	}

	_removeTile(key) {
		const tile = this._tiles[key];
		if (!tile) { return; }

		// Cancels any pending http requests associated with the tile
		tile.el.setAttribute('src', Util.emptyImageUrl);

		return GridLayer.prototype._removeTile.call(this, key);
	}

	_tileReady(coords, err, tile) {
		if (!this._map || (tile && tile.getAttribute('src') === Util.emptyImageUrl)) {
			return;
		}

		return GridLayer.prototype._tileReady.call(this, coords, err, tile);
	}

	_clampZoom(zoom) {
		return Math.round(GridLayer.prototype._clampZoom.call(this, zoom));
	}
}

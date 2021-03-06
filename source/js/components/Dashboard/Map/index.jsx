import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { fromJS } from 'immutable';
import Truncate from 'react-truncate';
import ReactMapboxGl, { Layer, Source, Popup } from 'react-mapbox-gl';
import { MAPBOX_API_KEY } from 'config/config';
import { placeItemHover, placeItemLeave, placeItemSelect, mapPositionChanged, mapZoomChanged, municipalityHover, municipalityLeave, selectPlace } from 'actions/app';
import mapboxgl from 'mapbox-gl';
import { FormattedMessage } from 'react-intl';
import CategoryName from 'components/Global/CategoryName';
import FocusHandler from 'components/Global/FocusHandler';
import MapSyncToggle from 'components/Global/MapSyncToggle';
import classNames from 'classnames';

const Map = ReactMapboxGl({
  accessToken: MAPBOX_API_KEY,
});

@connect(state => ({
  placeMapData: state.app.get('placeMapData'),
  currentMapPosition: state.app.get('currentMapPosition'),
  currentMapZoom: state.app.get('currentMapZoom'),
  categories: state.app.get('categories'),
  hoveredElement: state.app.get('hoveredElement'),
  hoveredMunicipality: state.app.get('hoveredMunicipality'),
  selectedElement: state.app.get('selectedElement'),
  placeSelected: state.app.get('placeSelected'),
}))
class ResultMap extends Component {
  static propTypes = {
    placeMapData: PropTypes.object,
    currentMapPosition: PropTypes.array,
    currentMapZoom: PropTypes.number,
    categories: PropTypes.object,
    items: PropTypes.object,
    hoveredElement: PropTypes.object,
    hoveredMunicipality: PropTypes.object,
    selectedElement: PropTypes.object,
    placeSelected: PropTypes.bool,

    // from react-redux connect
    dispatch: PropTypes.func,
  };

  constructor(props) {
    super(props);

    let coordinates = [13.2, 47.516231]; // Center of Austria
    let zoom = [7];

    /*
     *if a city is already selected chose its center as the map center
     * TODO: maybe deprecated due to map show on start?
     */

    if (this.props.currentMapPosition) {
      coordinates = this.props.currentMapPosition.toJS();
      zoom = [this.props.currentMapZoom];
    }

    this.state = {
      coordinates,
      zoom,
    };

    this.prepareMap = this.prepareMap.bind(this);
    this.componentWillUpdate = this.componentWillUpdate.bind(this);
    this.onMapMove = this.onMapMove.bind(this);
    this.updateHighlightedArea = this.updateHighlightedArea.bind(this);
    this.triggerMunicipalityHover = this.triggerMunicipalityHover.bind(this);
    this.triggerMunicipalityLeave = this.triggerMunicipalityLeave.bind(this);
    this.triggerMunicipalitySelect = this.triggerMunicipalitySelect.bind(this);
  }

  componentDidMount() {
    /*
     * dispatch a map position change for the result list on map initialization
     * TODO: maybe deprecated due to map show on start?
    */
    const { dispatch, placeMapData } = this.props;
    let { coordinates } = this.state;

    if (placeMapData.get('geometry')) {
      coordinates = placeMapData.get('geometry').get('coordinates').toJS();
    }

    dispatch(mapPositionChanged(coordinates));
  }

  componentWillUpdate(nextProps) {
    /*
     * move the center of the map to the city center when a new city is selected
     */
    if (this.state.coordinates[0] === 0 || nextProps.placeMapData.get('id') !== this.props.placeMapData.get('id')) {
      // prevent the map from moving on every redux state change
      const coordinates = nextProps.placeMapData.get('geometry').get('coordinates').toJS();
      this.setState({
        coordinates,
        zoom: [12],
      });
    }

    /*
     * move the center of the map to the currently selected POI
    */
    const currentSelected = this.props.selectedElement;
    const nextSelected = nextProps.selectedElement;

    if (
      (!currentSelected && nextSelected) ||
      (currentSelected && currentSelected.get('lastChange') !== nextSelected.get('lastChange'))
    ) {
      if (parseFloat(nextSelected.get('longitude')) > 0.0) {
        const coordinates = [
          parseFloat(nextSelected.get('longitude')),
          parseFloat(nextSelected.get('latitude')),
        ];

        this.setState({
          coordinates,
          zoom: [17],
        });
      }
    }

    /*
      re-adjust the map center after adding the sidebar shift
    */

    if (!this.props.placeSelected && nextProps.placeSelected) {
      setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
    }
  }

  /*
    dispatch map position events from mapbox to redux
  */
  onMapMove(map) {
    const { dispatch, currentMapZoom } = this.props;
    const mapCenter = map.getCenter();

    dispatch(mapPositionChanged([mapCenter.lng, mapCenter.lat]));

    if (map.getZoom() !== currentMapZoom) {
      dispatch(mapZoomChanged(map.getZoom()));
    }
  }

  /*
    sets mapbox.js options and registers event listeners for the map
  */
  prepareMap(map) {
    const { categories, dispatch } = this.props;
    map.addControl(new mapboxgl.NavigationControl());
    map.addControl(new mapboxgl.GeolocateControl());

    /* load category marker images */
    categories.forEach((category) => {
      map.loadImage(category.get('marker'), (error, image) => {
        map.addImage(category.get('name'), image);
      });
    });

    if (!window.USER_IS_TOUCHING) {
      /*
        trigger Pin hover
      */
      map.on('mousemove', 'unclustered-point', (e) => {
        const { hoveredElement } = this.props;

        // only trigger if we move over a new pin
        if (hoveredElement && hoveredElement.get('id') === e.features[0].properties.id) return;

        const canvas = map.getCanvas();
        canvas.style.cursor = 'pointer';

        dispatch(placeItemHover(
          this.props.items.find((c) => c.get('id') === e.features[0].properties.id)
        ));
      });

      map.on('mouseleave', 'unclustered-point', () => {
        const canvas = map.getCanvas();
        canvas.style.cursor = '';

        dispatch(placeItemLeave());
      });

      /*
       trigger municipality hover (small zoom size layer)
      */
      map.on('mousemove', 'municipalities', (e) => this.triggerMunicipalityHover(e, map));
      map.on('mouseleave', 'municipalities', (e) => this.triggerMunicipalityLeave(e, map));

      /*
        trigger municipality hover (large zoom size layer)
      */
      map.on('mousemove', 'municipalities-detail', (e) => this.triggerMunicipalityHover(e, map));
      map.on('mouseleave', 'municipalities-detail', (e) => this.triggerMunicipalityLeave(e, map));
    }

    map.on('click', 'unclustered-point', (e) => {
      dispatch(placeItemSelect(
        this.props.items.find((c) => c.get('id') === e.features[0].properties.id),
        'map'
      ));

      e.stopPropagation();
    });

    map.on('click', 'municipalities', (e) => this.triggerMunicipalitySelect(e));
    map.on('click', 'municipalities-detail', (e) => this.triggerMunicipalitySelect(e));

    this.updateHighlightedArea(map);
  }

  triggerMunicipalityHover(e, map) {
    const { dispatch, hoveredElement } = this.props;
    const { lngLat } = e;
    const element = e.features[0];
    const layerId = element.layer.id;
    let iso;
    let name;

    if (hoveredElement) return;

    if (layerId === 'municipalities') {
      iso = element.properties.iso;
      name = element.properties.name;
    } else {
      iso = element.properties.GKZ;
      name = element.properties.PG;
    }


    // check if we are already hovering over this place
    // if (hoveredMunicipality && hoveredMunicipality.get('iso') === iso) return;

    // clear the micro-timeout
    if (this.municipalityHoverTimer) clearTimeout(this.municipalityHoverTimer);

    /*
      the hover action is packed into a small timeout to reduce
      event calls when moving over a large area
    */
    this.municipalityHoverTimer = setTimeout(() => {
      const canvas = map.getCanvas();
      canvas.style.cursor = 'pointer';

      dispatch(municipalityHover({
        iso,
        name,
        longitude: lngLat.lng,
        latitude: lngLat.lat,
      }));

      this.updateHighlightedArea(map);
    }, 0);
  }

  triggerMunicipalityLeave(e, map) {
    const { dispatch } = this.props;
    const canvas = map.getCanvas();

    if (this.municipalityHoverTimer) clearTimeout(this.municipalityHoverTimer);
    canvas.style.cursor = '';

    dispatch(municipalityLeave());
  }

  triggerMunicipalitySelect(e) {
    const { dispatch, hoveredElement } = this.props;
    const { lngLat } = e;
    const { properties, layer } = e.features[0];
    let iso;
    let name;

    if (hoveredElement) return;

    if (layer.id === 'municipalities') {
      iso = properties.iso;
      name = properties.name;
    } else if (layer.id === 'municipalities-detail') {
      iso = properties.GKZ;
      name = properties.PG;
    }

    dispatch(municipalityLeave());
    dispatch(selectPlace(fromJS({
      id: iso,
      iso,
      text: name,
      geometry: {
        coordinates: [
          lngLat.lng,
          lngLat.lat,
        ],
      },
      properties,
    })));
  }

  /*
    removes the municipality selection layer from the currently selected municipality,
    adds hover effect to other municipailties
  */
  updateHighlightedArea(map) {
    const { placeMapData } = this.props;
    const municipalityName = placeMapData.get('text');
    const municipalityGkz = placeMapData.get('iso');

    const { hoveredMunicipality } = this.props;

    // filter current municipality
    if (municipalityName) {
      const pre = placeMapData.get('text').includes('Wien,') ? 'Wien ' : '';
      map.setFilter('municipalities', ['!=', 'name', pre + municipalityName]);

      if (municipalityGkz) map.setFilter('municipalities-detail', ['!=', 'GKZ', municipalityGkz.toString()]);
      else map.setFilter('municipalities-detail', ['!=', 'PG', municipalityName]);
    } else {
      map.setFilter('municipalities', ['has', 'name']);
      map.setFilter('municipalities-detail', ['has', 'GKZ']);
    }

    // hover-effect for municipalities
    if (map.getSource('municipality-hover-item')) {
      if (hoveredMunicipality) {
        let features;

        if (map.getZoom() <= 9.1) {
          features = map.querySourceFeatures('composite', {
            sourceLayer: 'gemeinden_wien_bezirke_geo',
            filter: ['==', 'iso', hoveredMunicipality.get('iso')],
          });
        } else {
          features = map.querySourceFeatures('composite', {
            sourceLayer: 'GKZGN-1ab8iv',
            filter: ['==', 'GKZ', hoveredMunicipality.get('iso')],
          });
        }

        map.getSource('municipality-hover-item').setData({ type: 'FeatureCollection', features });
      } else {
        map.getSource('municipality-hover-item').setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }

  /*
    render the map
  */
  render() {
    const {
      items,
      categories,
      hoveredElement,
      hoveredMunicipality,
      placeSelected,
    } = this.props;

    const filteredItems = items.toJS().filter((item) => parseFloat(item.longitude) > 0.0);

    const GEO_JSON_RESULTS = {
      type: 'geojson',
      data: {
        'type': 'FeatureCollection',
        'features': filteredItems.map((item) => ({
          'type': 'Feature',
          'properties': {
            'id': item.id,
            'category': item.category,
          },
          'geometry': {
            'type': 'Point',
            'coordinates': [parseFloat(item.longitude), parseFloat(item.latitude)],
          },
        })
      ),
      },
      cluster: true,
      clusterMaxZoom: 14, // Max zoom to cluster points on
      clusterRadius: 50, // Radius of each cluster when clustering points (defaults to 50)
    };

    // show the mouse-hover-popup
    let popup = null;

    if (hoveredMunicipality) {
      popup = (
        <Popup
          coordinates={ [parseFloat(hoveredMunicipality.get('longitude')), parseFloat(hoveredMunicipality.get('latitude'))] }
          offset={
            [0, 40]
           }
          style={ {
            'backgroundColor': 'black',
          } }
        >
          <FormattedMessage
            id='map.switchMunicipality'
            description='Title for the Switch Municipality Popup'
            defaultMessage='zu Gebiet wechseln'
          />
          <strong>{hoveredMunicipality.get('name')}</strong>
        </Popup>
      );
    }

    if (window.innerWidth > 669 && hoveredElement && hoveredElement.get('longitude') && hoveredElement.get('latitude')) {
      const hoveredCategory = categories.find((c) => c.get('name') === hoveredElement.get('category'));
      const address = hoveredElement.get('adresse');
      let hasPhoto = false;
      const descriptionText = hoveredElement.get('beschreibung');
      let hasText = false;

      let popUpAddress = '';
      if (address) {
        popUpAddress = (
          <span>, { address }</span>
        );
      }

      const photoContainerStyle = {};
      if (hoveredElement.get('foto') && !hoveredElement.get('foto').match(/\.(webm|wav|mid|midi|kar|flac|ogx|ogg|ogm|ogv|oga|spx|opus)/)) {
        hasPhoto = true;
        const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${ hoveredElement.get('foto') }?width=256`;
        photoContainerStyle.backgroundImage = `url('${ url }')`;
      } else if (descriptionText && descriptionText.length > 0) {
        hasText = true;
      }


      popup = (
        <Popup
          coordinates={ [parseFloat(hoveredElement.get('longitude')), parseFloat(hoveredElement.get('latitude'))] }
          style={ {
            'backgroundColor': hoveredCategory.get('color'),
          } }
          offset={
            [0, hasPhoto || hasText ? -100 : -40]
           }
        >
          { hasPhoto ? <div className='PhotoContainer' style={ photoContainerStyle } /> : null }

          { hasText ? <div className='TextContainer'>
            <div>
              <Truncate lines={ 4 }>
                <p
                  dangerouslySetInnerHTML={ { __html: descriptionText } } // eslint-disable-line
                />
              </Truncate>
            </div>
          </div> : null }

          <div className='DescriptionContainer'>
            <strong>{hoveredElement.get('name')}</strong>
            <CategoryName category={ hoveredCategory } />{popUpAddress}
          </div>
        </Popup>
      );
    }

    const wrapperClasses = classNames(
      'ResultMap-Wrapper',
      { 'ResultMap-Wrapper--shifted': placeSelected }
    );

    return (<div className='ResultMap'><div className={ wrapperClasses }>
      <Map
        style='mapbox://styles/wikimediaaustria/cji05myuu486p2slazs7ljpyw' // eslint-disable-line react/style-prop-object
        containerStyle={ {
          height: '100%',
          width: '100%',
        } }
        center={ this.state.coordinates }
        onStyleLoad={ this.prepareMap }
        onMoveEnd={ this.onMapMove }
        onMoveStart={ this.updateHighlightedArea }
        zoom={ this.state.zoom }
      >
        <Source id='items' geoJsonSource={ GEO_JSON_RESULTS } />
        <Source
          id='municipality-hover-item'
          geoJsonSource={ {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          } }
        />
        <Layer
          id='clusters'
          sourceId='items'
          type='circle'
          paint={ {
            'circle-color': {
              property: 'point_count',
              type: 'interval',
              stops: [
                    [0, '#57599A'],
                    [30, '#373974'],
                    [70, '#23224E'],
              ],
            },
            'circle-radius': {
              property: 'point_count',
              type: 'interval',
              stops: [
                    [0, 20],
                    [30, 30],
                    [70, 40],
              ],
            },
          } }
          layerOptions={ {
            filter: ['has', 'point_count'],
          } }
        />

        <Layer
          id='cluster-count'
          type='symbol'
          sourceId='items'
          layerOptions={ {
            filter: ['has', 'point_count'],
          } }
          layout={ {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Space Mono Bold', 'Arial Unicode MS Bold'],
            'text-size': 12,
          } }
          paint={ {
            'text-color': '#FFFFFF',
          } }
        />

        <Layer
          id='unclustered-point'
          type='symbol'
          sourceId='items'
          layerOptions={ {
            filter: ['!has', 'point_count'],
          } }
          layout={ {
            'icon-image': {
              property: 'category',
              type: 'categorical',
              stops: categories.toJS().map((cat) => [cat.name, cat.name]),
            },
            'icon-size': 0.5,
            'icon-allow-overlap': true,
          } }
        />

        <Layer
          id='municipality-hover'
          type='fill'
          sourceId='municipality-hover-item'
          paint={ {
            'fill-color': '#000',
            'fill-opacity': 0.08,
          } }
        />
        {popup}
      </Map></div>
      <FocusHandler view='map' />
      <MapSyncToggle />
    </div>
    );
  }

}

export default ResultMap;

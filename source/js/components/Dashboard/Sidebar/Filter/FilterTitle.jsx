import React, { Component } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { connect } from 'react-redux';
import { toggleFilterMenu } from 'actions/menu';
import { FormattedMessage } from 'react-intl';
import CategoryFilter from './CategoryFilter';

@connect(state => {
  let filtersActive = false;
  const activeFilters = state.app.get('activeFilters');
  const categories = state.app.get('categories');

  if (activeFilters.size > 0) filtersActive = true;
  if (categories.find((c) => !c.get('show'))) filtersActive = true;

  return {
    showFilterMenu: state.menu.get('showFilterMenu'),
    filtersActive,
  };
}, null, null, { pure: false })
class FilterTitle extends Component {
  static propTypes = {
    items: PropTypes.object,
    showFilterMenu: PropTypes.bool,
    filtersActive: PropTypes.bool,

    dispatch: PropTypes.func,
  };

  constructor(props) {
    super(props);

    this.toggle = this.toggle.bind(this);
  }

  toggle() {
    const { dispatch } = this.props;

    dispatch(toggleFilterMenu());
  }

  render() {
    const { items, showFilterMenu, filtersActive } = this.props;

    const ButtonClass = classNames({
      'FilterButton': true,
      'FilterButton--open': showFilterMenu,
      'FilterButton--filtersActive': filtersActive,
    });

    return (
      <header className='FilterTitle'>
        <h2>
          <FormattedMessage
            id='filter.itemCount'
            description='Title of the Filter Menu'
            defaultMessage='{itemCount, plural,
                =0 {keine Objekte}
                one {1 Objekte}
                other {{itemCount} Objekte}
            }'
            values={ {
              itemCount: items ? items.size : 0,
            } }
          />
        </h2>

        <CategoryFilter asIcons={ true } />

        <button
          className={ ButtonClass }
          onClick={ this.toggle }
        >
          <FormattedMessage
            id='filter.filterButtonTitle'
            description='Title of the Filter Menu Toggle-Button'
            defaultMessage='Liste filtern'
          />
        </button>
      </header>
    );
  }

}

export default FilterTitle;

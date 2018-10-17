"use strict";

const h = require('react-hyperscript')
    , R = require('ramda')
    , React = require('react')
    , styled = require('styled-components').default
    , { connect } = require('react-redux')
    , Action = require('../actions')

const SelectorWrapper = styled.div`
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 100%;
  padding: 10px 0;

  & select {
    padding: 1em;
  }

  & svg, & div.svg-wrapper {
    height: 100%;
    width: 100%;
  }

  & svg path:hover,
  & svg rect:hover {
    fill: #ccc;
    cursor: pointer;
  }

  & svg .treatment-selected {
    fill: lightsteelblue;
  }
`

const Tooltip = styled.div`
  position: absolute;
  z-index: 1;

  left: 0;
  right: 0;
  ${ props => props.pos === 'bottom' ? '' : 'bottom: 100%' }

  text-align: center;
  font-weight: bold;

  & span {
    display: inline-block;
    padding: .75rem 1.5rem;

    min-width: 200px;
    background: #fafafa;

    border: 1px solid #ccc;
    borderRadius: 4px;
  }
`

// Next TODO: Mount the SVG in the DOM and allow interacting with it
class TreatmentSelector extends React.Component {
  constructor() {
    super()

    this.state = {
      _hoveredTreatment: null,
    }

    this.handleSVGClick = this.handleSVGClick.bind(this)
    this.handleTreatmentEnter = this.handleTreatmentEnter.bind(this)
    this.handleTreatmentLeave = this.handleTreatmentLeave.bind(this)

  }

  componentDidMount() {
    const { svg } = this.props

    this.svgEl.innerHTML = svg;
    this.svgEl.addEventListener('click', this.handleSVGClick)

    ;[...this.svgEl.querySelectorAll('[data-treatment]')].forEach(el => {
      el.addEventListener('mouseenter', this.handleTreatmentEnter)
      el.addEventListener('mouseleave', this.handleTreatmentLeave)
    })
    this.updateSelectedTreatment()
  }

  componentDidUpdate(prevProps) {
    if (this.props.selectedTreatment !== prevProps.selectedTreatment) {
      this.updateSelectedTreatment()
    }
  }

  updateSelectedTreatment() {
    const { selectedTreatment } = this.props

    ;[...this.svgEl.querySelectorAll('.treatment-selected')].forEach(el => {
      el.classList.remove('treatment-selected')
    })

    const selectedEl = this.svgEl.querySelector(`[data-treatment="${selectedTreatment}"]`)

    if (selectedEl) {
      selectedEl.classList.add('treatment-selected')
    }
  }

  handleSVGClick(e) {
    const { onSelectTreatment } = this.props
        , clickedTreatment = R.path(['target', 'dataset', 'treatment'], e)

    if (clickedTreatment) {
      onSelectTreatment(clickedTreatment)
    }
  }

  handleTreatmentEnter(e) {
    const { dispatch } = this.props
        , _hoveredTreatment = R.path(['target', 'dataset', 'treatment'], e)

    this.setState({ _hoveredTreatment })
    dispatch(Action.SetHoveredTreatment(_hoveredTreatment))
  }

  handleTreatmentLeave() {
    const { dispatch } = this.props

    this.setState({ _hoveredTreatment: null })
    dispatch(Action.SetHoveredTreatment(null))
  }


  render() {
    const {
      treatments,
      selectedTreatment,
      onSelectTreatment,
      loading,
      tooltipPos,
    } = this.props

    const { _hoveredTreatment } = this.state

    const initialLoad = loading && !selectedTreatment

    const _treatments = Object.entries(treatments).map(([key, val]) => ({
      key,
      label: val.label || key,
    }))

    return (
      h(SelectorWrapper, [
        h('div.svg-wrapper', [
          h('div', {
            ref: el => { this.svgEl = el },
          }),

          tooltipPos && _hoveredTreatment && h(Tooltip, {
            pos: tooltipPos,
          }, [
            h('span', treatments[_hoveredTreatment].label),
          ]),
        ]),

        null && h('select', {
          value: selectedTreatment || '',
          disabled: initialLoad,
          onChange: e => {
            onSelectTreatment(e.target.value)
          },
        }, (!selectedTreatment ? [h('option', {
          key: '_blank',
          value: '',
        }, 'Initializing...')] : []).concat(_treatments.map(treatment =>
          h('option', {
            key: treatment.key,
            value: treatment.key,
          }, treatment.label),
        ))),
      ])
    )
  }
}

module.exports = connect(state => ({
  svg: R.path(['currentView', 'project', 'svg'], state),
  treatments: R.path(['currentView', 'project', 'treatments'], state),
  loading: R.path(['currentView', 'loading'], state),
}))(TreatmentSelector)

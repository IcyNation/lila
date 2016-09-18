var partial = require('chessground').util.partial;
var router = require('game').router;
var util = require('./util');
var pgnExport = require('./pgnExport');
var m = require('mithril');

var baseSpeeds = [{
  name: 'fast',
  delay: 1000
}, {
  name: 'slow',
  delay: 5000
}];

var allSpeeds = baseSpeeds.concat({
  name: 'realtime',
  delay: 'realtime'
});

var cplSpeeds = [{
  name: 'by CPL (fast)',
  delay: 'cpl_fast'
}, {
  name: 'by CPL (slow)',
  delay: 'cpl_slow'
}];

function deleteButton(data, userId) {
  if (data.game.source === 'import' &&
    data.game.importedBy && data.game.importedBy === userId)
    return m('form.delete', {
      method: 'post',
      action: '/' + data.game.id + '/delete',
      onsubmit: function() {
        return confirm('Delete this imported game?');
      }
    }, m('button.button.text.thin', {
      type: 'submit',
      'data-icon': 'q',
    }, 'Delete'));
}

function autoplayButtons(ctrl) {
  var d = ctrl.data;
  var speeds = d.game.moveTimes.length ? allSpeeds : baseSpeeds;
  return m('div.autoplay', speeds.map(function(speed, i) {
    var attrs = {
      class: 'button text' + (ctrl.autoplay.active(speed.delay) ? ' active' : ''),
      config: util.bindOnce('click', partial(ctrl.togglePlay, speed.delay))
    };
    if (i === 0) attrs['data-icon'] = 'G';
    return m('a', attrs, speed.name);
  }));
}

function autoplayCplButtons(ctrl) {
  var d = ctrl.data;
  return m('div.autoplay', cplSpeeds.map(function(speed, i) {
    var attrs = {
      class: 'button text' + (ctrl.autoplay.active(speed.delay) ? ' active' : ''),
      config: util.bindOnce('click', partial(ctrl.togglePlay, speed.delay))
    };
    if (i === 0) attrs['data-icon'] = 'G';
    return m('a', attrs, speed.name);
  }));
}

function studyButton(ctrl) {
  if (ctrl.study || ctrl.ongoing) return;
  var realGame = !util.synthetic(ctrl.data);
  return m('form', {
    method: 'post',
    action: '/study',
    onsubmit: function(e) {
      var pgnInput = e.target.querySelector('input[name=pgn]');
      if (pgnInput) pgnInput.value = pgnExport.renderFullTxt(ctrl);
    }
  }, [
    realGame ? m('input[type=hidden][name=gameId]', {
      value: ctrl.data.game.id
    }) : m('input[type=hidden][name=pgn]'),
    m('input[type=hidden][name=orientation]', {
      value: ctrl.chessground.data.orientation
    }),
    m('input[type=hidden][name=variant]', {
      value: ctrl.data.game.variant.key
    }),
    m('input[type=hidden][name=fen]', {
      value: ctrl.tree.root.fen
    }),
    m('button.button.text', {
      'data-icon': '',
      type: 'submit'
    }, realGame ? 'Study this game' : 'Save as a study')
  ]);
}

module.exports = {
  controller: function() {

    this.open = false;

    this.toggle = function() {
      this.open = !this.open;
    }.bind(this);
  },
  view: function(ctrl) {
    var flipAttrs = {};
    var d = ctrl.data;
    if (d.userAnalysis) flipAttrs.config = util.bindOnce('click', ctrl.flip);
    else flipAttrs.href = router.game(d, d.opponent.color) + '#' + ctrl.vm.node.ply;
    var canContinue = !ctrl.ongoing && d.game.variant.key === 'standard';

    return m('div.action_menu', [
      m('a.button.text[data-icon=B]', flipAttrs, ctrl.trans('flipBoard')),
      ctrl.ongoing ? null : m('a.button.text[data-icon=m]', {
        href: d.userAnalysis ? '/editor?fen=' + ctrl.vm.node.fen : '/' + d.game.id + '/edit?fen=' + ctrl.vm.node.fen,
        rel: 'nofollow'
      }, ctrl.trans('boardEditor')),
      canContinue ? m('a.button.text[data-icon=U]', {
        config: util.bindOnce('click', function() {
          $.modal($('.continue_with.' + d.game.id));
        })
      }, ctrl.trans('continueFromHere')) : null,
      ctrl.vm.mainline.length > 4 ? autoplayButtons(ctrl) : null,
      d.analysis ? autoplayCplButtons(ctrl) : null, [
        (function(id) {
          return m('div.setting', [
            m('div.switch', [
              m('input', {
                id: id,
                class: 'cmn-toggle cmn-toggle-round',
                type: 'checkbox',
                checked: ctrl.vm.showAutoShapes(),
                config: util.bindOnce('change', function(e) {
                  ctrl.toggleAutoShapes(e.target.checked);
                })
              }),
              m('label', {
                'for': id
              })
            ]),
            m('label', {
              'for': id
            }, 'Computer arrows')
          ]);
        })('analyse-toggle-ceval'), (function(id) {
          return m('div.setting', [
            m('div.switch', [
              m('input', {
                id: id,
                class: 'cmn-toggle cmn-toggle-round',
                type: 'checkbox',
                checked: ctrl.vm.showGauge(),
                config: util.bindOnce('change', function(e) {
                  ctrl.toggleGauge(e.target.checked);
                })
              }),
              m('label', {
                'for': id
              })
            ]),
            m('label', {
              'for': id
            }, 'Computer gauge')
          ]);
        })('analyse-toggle-gauge'),
        studyButton(ctrl)
      ],
      deleteButton(d, ctrl.userId),
      ctrl.ongoing ? null : m('div.continue_with.' + d.game.id, [
        m('a.button', {
          href: d.userAnalysis ? '/?fen=' + ctrl.encodeNodeFen() + '#ai' : router.continue(d, 'ai') + '?fen=' + ctrl.vm.node.fen,
          rel: 'nofollow'
        }, ctrl.trans('playWithTheMachine')),
        m('br'),
        m('a.button', {
          href: d.userAnalysis ? '/?fen=' + ctrl.encodeNodeFen() + '#friend' : router.continue(d, 'friend') + '?fen=' + ctrl.vm.node.fen,
          rel: 'nofollow'
        }, ctrl.trans('playWithAFriend'))
      ])
    ]);
  }
};

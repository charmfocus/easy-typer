/* eslint-disable */
// 渲染性能回归测试：跟打输入过程中 Words 子组件的更新次数应与按键数同阶，
// 而不是随已打字数线性放大（分词实例未稳定化时，每次按键会重渲染全部已打词）
import { createLocalVue, mount } from '@vue/test-utils'
import Vue from 'vue'
import Vuex, { Store } from 'vuex'
import Article from '@/components/Article.vue'
import { Word, Coding } from '@/store/types'
import { Graph, ShortestPath } from '@/store/util/Graph'

jest.mock('@/components/Words.vue', () => {
  const state = { count: 0 }
  return {
    __state: state,
    name: 'Words',
    props: { word: { type: Object, required: true } },
    updated () { state.count++ },
    render (h: any) { return h('div', (this as any).word.text) }
  }
})

const WordsMock: { __state: { count: number } } = require('@/components/Words.vue')

const localVue = createLocalVue()
localVue.use(Vuex)

/**
 * 构造词提模式的最短路径：每两个字一组词
 */
function buildShortest (content: string): ShortestPath<Word> {
  const graph = new Graph<Word>()
  const n = content.length
  for (let i = 0; i + 2 <= n; i += 2) {
    graph.addEdge({
      from: i + 2,
      to: i,
      length: 4,
      value: new Word(i, content.slice(i, i + 2), 'code2', false, 'x', [new Coding(0, 'abcd', 0)])
    })
  }
  if (n % 2 === 1) {
    graph.addEdge({
      from: n,
      to: n - 1,
      length: 4,
      value: new Word(n - 1, content[n - 1], 'code2', false, 'x', [new Coding(0, 'abcd', 0)])
    })
  }
  return graph.shortestPath()
}

function createStore (content: string, hint: boolean): Store<any> {
  return new Store({
    modules: {
      article: {
        namespaced: true,
        state: () => ({
          content,
          identity: '1',
          title: 't',
          shortest: hint ? buildShortest(content) : null
        }),
        getters: { length: (s: any) => s.content.length }
      },
      racing: {
        namespaced: true,
        state: () => ({ input: '' }),
        getters: { progress: () => 0 }
      },
      setting: {
        namespaced: true,
        state: () => ({ hint, fontSize: '2rem', articleRows: 4, hintOptions: ['code', 'select'] })
      }
    }
  })
}

const CONTENT = '的一是在了有和这人中都大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉律林另毛维如球玖望算持误奏态敢材忘河套哥仅鞋针'.slice(0, 500)

describe('Article.vue 渲染性能', () => {
  const KEYSTROKES = 100

  it.each([[true], [false]])('hint=%s：子组件更新次数与按键数同阶', async (hint: boolean) => {
    const store = createStore(CONTENT, hint)
    mount(Article, { store, localVue })

    WordsMock.__state.count = 0
    for (let i = 1; i <= KEYSTROKES; i++) {
      store.state.racing.input = CONTENT.slice(0, i)
      await Vue.nextTick()
    }
    // 未稳定化时 hint 模式实测为 2550 次（每次按键重渲染全部已打词）；
    // 稳定化后每次按键只更新正在输入的词，放宽到 3 倍按键数防抖
    expect(WordsMock.__state.count).toBeLessThan(KEYSTROKES * 3)
  })
})

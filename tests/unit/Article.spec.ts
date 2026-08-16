import { createLocalVue, shallowMount, Wrapper } from '@vue/test-utils'
import Vue from 'vue'
import Vuex, { Store } from 'vuex'
import Article from '@/components/Article.vue'

const localVue = createLocalVue()
localVue.use(Vuex)

/**
 * 构造 Article 组件依赖的最小 store
 */
function createStore (content: string, input: string): Store<unknown> {
  return new Store({
    modules: {
      article: {
        namespaced: true,
        state: () => ({
          content,
          identity: '1',
          title: '测试赛文',
          shortest: null
        }),
        getters: {
          length: (state: { content: string }) => state.content.length
        }
      },
      racing: {
        namespaced: true,
        state: () => ({ input }),
        getters: {
          progress: () => 0
        }
      },
      setting: {
        namespaced: true,
        state: () => ({
          hint: false,
          fontSize: '2rem',
          articleRows: 4,
          hintOptions: []
        })
      }
    }
  })
}

describe('Article.vue words 稳定化', () => {
  it('空内容时返回空数组', () => {
    const wrapper = shallowMount(Article, {
      store: createStore('', ''),
      localVue
    })
    expect((wrapper.vm as any).words).toEqual([])
  })

  it('输入变化时未变化的分词复用旧实例（减少子组件重渲染）', async () => {
    const store = createStore('abcd', 'ax')
    const wrapper = shallowMount(Article, { store, localVue })

    const before = (wrapper.vm as any).words as Array<{ id: number; text: string; type: string }>
    expect(before.map(w => ({ id: w.id, text: w.text, type: w.type }))).toEqual([
      { id: 0, text: 'a', type: 'correct' },
      { id: 1, text: 'b', type: 'error' },
      { id: 2, text: 'cd', type: 'pending' }
    ])

    // 继续输入 'c'（对照 'abcd'：a 对 b 错 c 对）：未变化的 'a'/'b' 段复用旧实例，
    // 新增的 'c' 段与缩短的待打段产生新实例
    ;(store.state as any).racing.input = 'axc'
    await Vue.nextTick()

    const after = (wrapper.vm as any).words as Array<{ id: number; text: string; type: string }>
    expect(after.map(w => ({ id: w.id, text: w.text, type: w.type }))).toEqual([
      { id: 0, text: 'a', type: 'correct' },
      { id: 1, text: 'b', type: 'error' },
      { id: 2, text: 'c', type: 'correct' },
      { id: 3, text: 'd', type: 'pending' }
    ])
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[1])
    expect(after[2]).not.toBe(before[2])
  })
})

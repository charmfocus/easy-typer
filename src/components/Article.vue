<template>
  <div id="article-main">
    <el-row ref="board" :class="articleStyle">
      <Words v-for="word in words" :key="word.id" :word="word"/>
    </el-row>
    <el-divider class="article-info" content-position="right">
      <span>第{{ identity }}段</span>
      <span>{{ title || '未知' }}</span>
      <span>共{{ length }}字</span>
    </el-divider>
  </div>
</template>

<script lang="ts">
import { Word } from '@/store/types'
import { Edge, ShortestPath } from '@/store/util/Graph'
import { Component, Vue, Watch } from 'vue-property-decorator'
import { namespace } from 'vuex-class'
import Words from '@/components/Words.vue'

const article = namespace('article')
const racing = namespace('racing')
const setting = namespace('setting')

// 分词缓存挂在组件实例上（WeakMap 保持非响应式，
// 避免在 words 计算属性内读写响应式字段造成循环触发）
const wordCaches = new WeakMap<object, Map<number, Word>>()

@Component({
  components: { Words }
})
export default class Article extends Vue {
  @article.State('content')
  private content!: string

  @article.State('identity')
  private identity!: string

  @article.State('title')
  private title!: string

  @article.Getter('length')
  private length!: number

  @racing.State('input')
  private input!: string

  @article.State('shortest')
  private shortest!: ShortestPath<Word> | null;

  @racing.Getter('progress')
  private progress!: number

  @setting.State('hint')
  private hint!: boolean

  @setting.State('fontSize')
  private fontSize!: string

  @setting.State('articleRows')
  private articleRows!: number

  @setting.State('hintOptions')
  private hintOptions!: Array<string>

  get articleStyle (): Array<string> {
    let mode = 'inline'
    if (this.hint && this.shortest && (this.codeHint || this.selectHint || this.autoSelectHint)) {
      mode = 'grid'
    }
    return ['article', mode]
  }

  get selectHint (): boolean {
    return this.hintOptions.indexOf('select') >= 0
  }

  get codeHint (): boolean {
    return this.hintOptions.indexOf('code') >= 0
  }

  get autoSelectHint (): boolean {
    return this.hintOptions.indexOf('autoSelect') >= 0
  }

  get words (): Array<Word> {
    const length = this.content.length
    if (length === 0) {
      wordCaches.delete(this)
      return []
    }

    const input = this.input
    const words: Array<Word> = []
    if (!this.hint || !this.shortest) {
      const inputLength = input.length
      const typed = this.content.substring(0, inputLength)
      this.check(0, input, typed, words)
      const pending = this.content.substring(inputLength)
      words.push(new Word(inputLength, pending, 'pending'))
    } else {
      const { path, vertices } = this.shortest
      for (let i = 0; i < length;) {
        // TODO: 扩折号会报错，如：老去——致爸
        const vertice = vertices[path[i]]
        const edge = vertice?.get(i)
        if (!edge) {
          i++
          continue
        }
        const next = this.addPhrase(input, edge, words)
        i = next === 0 ? path[i] : next
      }
    }

    return this.stabilize(words)
  }

  /**
   * words 每次按键都会重新计算，直接返回会产生一批全新 Word 实例，
   * 使所有 Words 子组件因 props 引用变化而整体重渲染。
   * 这里按 id 缓存上一次的实例，字段未变化的分词复用旧对象，
   * 让 Vue 跳过未变化子组件的渲染，降低跟打输入延迟。
   */
  stabilize (words: Array<Word>): Array<Word> {
    const prev = wordCaches.get(this) || new Map<number, Word>()
    const next = new Map<number, Word>()
    const result = words.map(word => {
      const cached = prev.get(word.id)
      const stable = cached &&
        cached.text === word.text &&
        cached.type === word.type &&
        cached.select === word.select &&
        cached.autoSelect === word.autoSelect &&
        // 词提编码来自最短路径图，实例稳定可直接比较引用；双方均为空数组（默认值）也视为相等
        (cached.codings === word.codings || (cached.codings.length === 0 && word.codings.length === 0))
        ? cached
        : word
      next.set(word.id, stable)
      return stable
    })
    wordCaches.set(this, next)
    return result
  }

  /**
   * 自动调整滚动条位置
   */
  @Watch('progress')
  autoScroll (progress: number) {
    const el = (this.$refs.board as Vue).$el
    const { clientHeight, scrollHeight } = el
    const scrollDistance = scrollHeight - clientHeight
    if (scrollDistance <= 0) {
      return
    }

    if (progress === 0) {
      el.scrollTop = 0
      return
    }

    const suffixOffset = this.hint ? 2 : 1
    const baseOffset = (parseFloat(this.fontSize) + suffixOffset) * 12

    const fixed = this.hint ? Math.max(0, baseOffset * (this.articleRows - 1) - 0.5 * baseOffset) : baseOffset * (this.articleRows - 1)

    const pending = document.querySelector('.code1,.code2,.code3,.code4,.pending') as HTMLElement
    if (pending) {
      el.scrollTop = Math.max(0, pending.offsetTop - fixed)
    } else {
      el.scrollTop = Math.min(progress * scrollDistance, scrollDistance)
    }
  }

  check (index: number, input: string, target: string, words: Array<Word>): void {
    const length = target.length
    const targetWords = target.split('')
    const inputWords = input.split('')
    let lastCorrect = targetWords[0] === inputWords[0]
    let text = ''

    inputWords.forEach((v, i) => {
      if (i >= length) {
        return
      }

      const target = targetWords[i]
      const correct = v === target

      if (correct !== lastCorrect) {
        words.push(new Word(index + i - text.length, text, lastCorrect ? 'correct' : 'error'))
        text = ''
        lastCorrect = correct
      }
      text = text.concat(target)
    })

    if (text.length > 0) {
      words.push(new Word(index + input.length - text.length, text, lastCorrect ? 'correct' : 'error'))
    }
  }

  addPhrase (content: string, edge: Edge<Word>, words: Array<Word>): number {
    const { from, to, value } = edge

    if (content.length <= to) {
      // 输入长度小于当前词首，未打
      words.push(value)
      return 0
    } else {
      // 输入长度大于当前词尾，已打, 否则部分已打
      const length = content.length
      const source = content.substring(to, Math.min(from, length))
      this.check(to, source, value.text, words)
      return length > from ? 0 : length
    }
  }
}
</script>

<style lang="scss">
  #article-main {
    word-break: break-all;
  }
</style>

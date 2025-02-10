import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Heading from '@tiptap/extension-heading'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'
import ThinkingAnimation from './ThinkingAnimation'

interface EditorProps {
  content: string;
  onChange?: (html: string) => void;
  editable?: boolean;
}

export default function Editor({ content, onChange, editable = false }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'citation'
        },
      }),
      Heading.configure({
        levels: [1, 2, 3, 4, 5, 6],
        HTMLAttributes: {
          class: 'font-semibold',
        },
      }),
      Placeholder.configure({
        placeholder: 'Start typing...',
      }),
    ],
    content: content,
    editable: editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: `prose prose-invert max-w-none focus:outline-none
          [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:my-6
          [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:my-5
          [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:my-4
          [&>h4]:text-xl [&>h4]:font-bold [&>h4]:my-3
          [&>h5]:text-lg [&>h5]:font-bold [&>h5]:my-3
          [&>h6]:text-base [&>h6]:font-bold [&>h6]:my-2
          [&>p]:text-base [&>p]:my-3 [&>p]:leading-7
          [&>ul]:list-disc [&>ul]:my-4 [&>ul]:ml-6
          [&>ul>li]:ml-4 [&>ul>li]:my-2
          [&>ul>li]:text-base
          [&_.citation]:inline-flex [&_.citation]:items-center 
          [&_.citation]:text-blue-400 
          [&_.citation]:text-sm 
          [&_.citation]:no-underline
          [&_.citation]:cursor-pointer
          [&_.citation]:whitespace-nowrap
        `.replace(/\s+/g, ' ').trim(),
      },
    },
    immediatelyRender: false
  })

  // Update editor content when it changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  // Update editor editable state when it changes
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable)
    }
  }, [editable, editor])

  if (!editor) {
    return null
  }

  return (
    <div className="prose prose-invert max-w-none">
      <EditorContent 
        editor={editor} 
        className={`min-h-[600px] ${editable ? 'cursor-text' : 'cursor-default'}`}
      />
    </div>
  )
} 
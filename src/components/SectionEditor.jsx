// Single editable lesson section: header input + body textarea +
// reorder/delete controls. Used in LessonWorkspace.
//
// Props:
//   section       — { header, body }
//   index         — 0-based position in the parent's list
//   total         — total number of sections (for arrow-disable logic)
//   isActive      — true when this is the section the cursor is in;
//                   parent uses this to know where to drop ✨ Draft /
//                   💡 Brainstorm / 📖 Insert-verse output
//   onChange      — (patch) => void; patch is {header?, body?}
//   onDelete      — () => void
//   onMoveUp      — () => void
//   onMoveDown    — () => void
//   onFocusBody   — () => void; parent uses this to track active section
//   bodyRef       — optional ref forwarded to the body textarea so the
//                   parent can read selectionStart for cursor-aware insert
export default function SectionEditor({
  section,
  index,
  total,
  isActive,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onFocusBody,
  bodyRef,
}) {
  return (
    <div
      className={
        'border rounded p-3 space-y-2 ' +
        (isActive
          ? 'border-umc-300 bg-umc-50/40'
          : 'border-gray-200 bg-white')
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wide text-gray-500 shrink-0">
          §{index + 1}
        </span>
        <input
          type="text"
          className="input flex-1 text-sm font-medium"
          placeholder="Header"
          value={section.header || ''}
          onChange={(e) => onChange({ header: e.target.value })}
        />
        <div className="flex items-center gap-1 shrink-0 text-xs">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index >= total - 1}
            className="text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1"
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-red-600 hover:text-red-800 underline px-1"
            title="Delete section"
          >
            ✕
          </button>
        </div>
      </div>
      <textarea
        ref={bodyRef}
        className="input w-full font-serif text-sm leading-relaxed min-h-[120px]"
        placeholder="Body"
        value={section.body || ''}
        onChange={(e) => onChange({ body: e.target.value })}
        onFocus={onFocusBody}
      />
    </div>
  );
}

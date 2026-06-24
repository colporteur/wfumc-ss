// Build-time stamp injected by vite.config.js via `define`. Renders a
// small unobtrusive marker so the pastor can confirm a deploy actually
// shipped when investigating "the change isn't showing up" issues.

export default function VersionStamp() {
  // eslint-disable-next-line no-undef
  const time = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev';
  // eslint-disable-next-line no-undef
  const sha = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'local';
  return (
    <p className="mt-12 text-center text-[10px] text-gray-400">
      Build {sha} · {time}
    </p>
  );
}

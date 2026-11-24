import { cloneElement, useEffect, useRef, useState } from 'react';
import { Tooltip } from '@mantine/core';

export default function TapTooltip({ label, children }) {
  const [opened, setOpened] = useState(false);
  const target = useRef(null);
  const pointerFocus = useRef(false);

  useEffect(() => {
    if (!opened) return undefined;
    const dismiss = (event) => {
      if (!target.current?.contains(event.target)) setOpened(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [opened]);

  return (
    <Tooltip label={label} opened={opened}>
      {cloneElement(children, {
        ref: (node) => {
          target.current = node;
          const childRef = children.props.ref;
          if (typeof childRef === 'function') childRef(node);
          else if (childRef) childRef.current = node;
        },
        tabIndex: children.props.tabIndex ?? 0,
        onPointerDown: () => { pointerFocus.current = true; },
        onPointerEnter: (event) => { if (event.pointerType === 'mouse') setOpened(true); },
        onPointerLeave: (event) => { if (event.pointerType === 'mouse') setOpened(false); },
        onFocus: () => { if (!pointerFocus.current) setOpened(true); },
        onBlur: () => setOpened(false),
        onClick: () => { pointerFocus.current = false; setOpened((value) => !value); },
        onKeyDown: (event) => { if (event.key === 'Escape') setOpened(false); },
      })}
    </Tooltip>
  );
}

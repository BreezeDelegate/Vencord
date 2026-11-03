/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize } from "@utils/modal";
import type { RenderModalProps } from "@vencord/discord-types";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";

type LegacySafeModalProps = PropsWithChildren<RenderModalProps & {
    title: ReactNode;
    subtitle?: ReactNode;
    size?: "md" | "lg" | "xl";
}>;

// The modern exported Modal currently resolves through Discord's virtual list
// component on Stable; without sections it throws before any children render.
// Legacy modal primitives still use Discord's nonvirtualized scroll container.
const Root = ModalRoot as ComponentType<any>;
const Header = ModalHeader as ComponentType<any>;
const Content = ModalContent as ComponentType<any>;
const Close = ModalCloseButton as ComponentType<any>;

export function LegacySafeModal({ title, subtitle, children, size = "lg", onClose, ...modalProps }: LegacySafeModalProps) {
    return (
        <Root {...modalProps} size={size === "md" ? ModalSize.MEDIUM : ModalSize.LARGE}>
            <Header>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-default)" }}>{title}</div>
                    {subtitle && <div style={{ marginTop: 8 }}>{subtitle}</div>}
                </div>
                <Close onClick={onClose} />
            </Header>
            <Content style={{ padding: "16px 20px 20px", minHeight: 0, maxHeight: "min(78vh, 800px)" }}>
                {children}
            </Content>
        </Root>
    );
}

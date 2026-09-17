/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

import { ProfileLocationSection } from "./ProfileLocationSection";
import { hydrateLocations } from "./store";
import managedStyle from "./styles.css?managed";

const SafeProfileLocationSection = ErrorBoundary.wrap(ProfileLocationSection, { noop: true });

export default definePlugin({
    name: "ProfileLocationWidget",
    description: "Adds local-only custom locations, an interactive map and local time to user profiles.",
    authors: [Devs.BreezeDelegate],
    tags: ["Appearance", "Utility"],
    enabledByDefault: false,
    managedStyle,

    patches: [
        {
            find: ".SIDEBAR,disableToolbar:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id)\}\)\}\))(?=.{0,100}unownedWishlistItems:\i,wishlistId:\i)/,
                replace: "$self.renderProfileLocation({userId:$2,isSideBar:true}),$1"
            }
        },
        {
            find: ",applicationRoleConnection:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$self.renderProfileLocation({userId:$2,isSideBar:false}),$1,"
            }
        },
        {
            find: ".MODAL_V2,onClose:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$self.renderProfileLocation({userId:$2,isSideBar:false}),$1,"
            }
        }
    ],

    renderProfileLocation(props: { userId: string; isSideBar: boolean; }) {
        return <SafeProfileLocationSection {...props} />;
    },

    async start() {
        await hydrateLocations();
    }
});

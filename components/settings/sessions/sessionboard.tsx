import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { IconPalette, IconChevronDown, IconDownload, IconExternalLink } from "@tabler/icons-react";
import toast from "react-hot-toast";
import { Listbox } from "@headlessui/react";


const SessionBoard = () => {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <IconPalette size={20} className="text-primary" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Session Board Module
          </h3>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Install the session board module in your Roblox experience to display upcoming sessions in-game.
        </p>
      </div>


        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => window.open(`/api/workspace/${router.query.id}/settings/sessions/download`)}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <IconDownload className="w-4 h-4" />
            Download module
          </button>
          <a
            href="https://docs.firefli.co/workspace/sessions"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <IconExternalLink className="w-4 h-4" />
            Setup guide
          </a>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Download the module and follow the setup guide to get started.
        </p>
      </div>
  );
};

SessionBoard.title = "Session Board";

export default SessionBoard;

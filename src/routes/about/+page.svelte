<script lang="ts">
	import { moves } from '$lib/Game';
</script>

<svelte:head>
	<title>About Ultra Ball</title>
	<meta
		name="description"
		content="Learn the history and rules of Ultra Ball, the traditional game of shotgun/war codified and taken to the next level with more possible moves and avenues. It's online, free, ad-free, and multiplayer, so try it out!"
	/>
	<meta
		name="keywords"
		content="about, ultra, ball, shotgun, war, multiplayer, game, online, free, ad-free"
	/>
	<meta property="og:title" content="About Ultra Ball | Online Multiplayer Strategy Game" />
	<meta
		property="og:description"
		content="Learn the history and rules of Ultra Ball, the traditional game of shotgun/war codified and taken to the next level with more possible moves and avenues. It's online, free, ad-free, and multiplayer, so try it out!"
	/>
</svelte:head>

<h1>About <a class="title" href="/" title="Go To Game">Ultra Ball</a></h1>
<b
	><u>Note:</u> You do not <i>need</i> to read this. Everything you need to know should be revealed as
	you play. To have the most fun, just create or join a game and get going. That being said, there are
	some tips and clarifications here that may be helpful as you play more, so come back here if/when you
	feel it could help.</b
>
<h2>General</h2>
<p>
	<u>What is Ultra Ball?</u> Ultra Ball is an extreme extension of the classic hand game War and
	possesses many similarities to Rock, Paper & Scissors. However, instead of just having three moves
	like in each of those games, there are a total of {moves.length} moves and infinite possible strategies!
	<br />
	<br />
	<small>
		<i>
			Should you reload now? Or is your opponent preparing for a big attack like Death Smoke, in
			which case you should strike now while he reloads? But while you focus on eliminating the
			biggest threat, what if someone else shoots you from behind the back? Is Mirror worth risking?
			If you use Spiral Ball, you can kill someone, but he knows you have the reloads, so he might
			do Shotgun back, but if does that, you can do Mirror, but what if he knows that...?
		</i>
	</small>
	<br />
	<br />
	As you can see, the game is a mix of strategy, luck, and psychology. In the end, you are bound to have
	a lot of fun, whether alone against bots or with friends.
</p>
<p>
	<u>History/Credits:</u> This game was invented by one of my closest friend groups, dubbed the NJ Family.
	Our parents are all first-generation immigrants from India who met in college. As their children, we
	have always had a close bond, and we developed this game as a simple pastime in 2018 by extending War.
	Now, in 2023, I see the potential this game has to be a quick, fun, and engaging activity for everyone,
	so I developed the online version you are on now. At its core, Ultra Ball is still a children's game,
	but it is one that is interesting, unique, and adaptable to any setting, so people of all ages can
	enjoy!
</p>
<h2>Setup</h2>
<p>
	<u>Hosting:</u> You can play Ultra Ball on your own or with friends (generally, the more the merrier)!
	To create a game, simply set a "cap" for the maximum number of human players who can play ("1" if playing
	by yourself). Also, decide whether the last human player alive automatically wins or if he must beat
	all of the bots too. You must check this box if playing solo, otherwise the game would automatically
	end since you are the last human player (don't worry, it will tell you that when you try to set up
	the game). Lastly, choose if you want the game to be able to be found by other players online. After
	you click start, you will be taken to the lobby screen. In the lobby, you can add/remove bots and remove
	unwanted players. For your convenience, the game will automatically start once the cap is reached.
</p>
<p>
	<u>Joining:</u> To join a game, simply use the link/code provided by the host or search for public
	games. When you're ready, click join. That's all!
</p>
<h2>Gameplay</h2>
<p>
	Each round, you will be prompted to choose a move. You will only see moves that are available to
	you, but if you click on a reload, you can see what moves it lets you unlock. The box on the
	screen will tell you what the move is, what type of move (offense, defense, defense-offense, or
	reload) it is, what it beats, what beats it, who it targets (one player, yourself, or everyone),
	etc. Over time, you should need this less, but if you ever forget, it's there for you. If
	applicable, select a target (if using single-player offensive move) and type the number of reloads
	you are using (in the case of Death Smoke, the most powerful move, which can use any combination
	of 10 reloads). Finally, press submit; you may be directed to a loading screen, which indicates a
	bad connection, but you should eventually be taken to a waiting screen. From there, you can see
	who has moved and who you are waiting on. The host can skip the turns of players who are taking
	too long, in which case they will be left vulnerable to attack. The host can also remove people if
	needed. Once everyone has moved, the results will be displayed, and people who are still alive can
	click a button to go to the next round. Dead individuals can spectate from the screen they are on.
	After the game ends, a summary page will be displayed with the results of who lived, who died, and
	what the final moves were.
</p>
<h2>Moves</h2>
<p>
	<u>Offense:</u> These moves are used to kill other players. They are the only moves that can kill and
	the only moves that require reloads. The most powerful of these moves is Death Smoke, which kills everyone
	in the game unless they are wearing a Mask. It requires 10 reloads (mixing any combination) to use.
	Also, note that Knife, which requires a reload, does not beat anything. Knife exists to punish mirror
	spammers, for it is the cheapest move that can beat mirror. Thus, it can often be a very useful tool
	to have as a threat, even if you do not use it. However, be cautious, for even the no-reload Shotgun
	can beat Knife ("don't bring a knife to a gunfight"). Lastly, note that Spiral Ball and Bazooka appear
	to beat the same number of other offensive moves. However, Spiral Ball is more powerful because it
	can penetrate Shield, which is almost unbeatable otherwise. Also, it only loses to Shotgun, which can
	be more easily anticipated and countered by the person with Spiral Ball using Mirror.
</p>
<ul>
	{#each moves.filter((m) => m.method === 'offense') as move}
		<li>
			{move.title} ({move.icon})
			{#if move.method == 'offense' && move.beats.length > 0}
				beats {#each move.beats as beat}
					<span title={moves.find((m) => m.id === beat)?.title}>
						{moves.find((m) => m.id === beat)?.icon}
					</span>
				{/each}
			{/if}
		</li>
	{/each}
</ul>
<p>
	<u>Defense:</u> These moves are used to protect yourself against offensive moves. They only have any
	effect if someone attacks you with an offensive move. No defensive moves require reloads. Both of the
	defensive moves work against everyone, so they are useful in multiplayer games. Shield is generally
	the go-to defense, but Mask is the only one that can protect you from Death Smoke. Note that neither
	of these protects against Spiral Ball, which can only be beaten with Shotgun!
</p>
<ul>
	{#each moves.filter((m) => m.method === 'defense') as move}
		<li>
			{move.title} ({move.icon})
			{#if move.method == 'defense' && move.defends.length > 0}
				defends against {#each move.defends as defend}
					<span title={moves.find((m) => m.id === defend)?.title}>
						{moves.find((m) => m.id === defend)?.icon}
					</span>
				{/each}
			{/if}
		</li>
	{/each}
</ul>
<p>
	<u>Defense-offense:</u> This special category consists only of Mirror. Mirror, if used against a weaker
	move, can reflect the move back at the opponent, killing him instead. However, it works against fewer
	moves than Shield, the comparable defensive move, and thus should be used with caution. Also, Mirror
	only works against a single individual, which is an important potential disadvantage in a multiplayer
	context.
</p>
<ul>
	{#each moves.filter((m) => m.method === 'defense-offense') as move}
		<li>
			{move.title} ({move.icon})
			{#if move.method == 'defense-offense' && move.reflects.length > 0}
				reflects {#each move.reflects as reflect}
					<span title={moves.find((m) => m.id === reflect)?.title}>
						{moves.find((m) => m.id === reflect)?.icon}
					</span>
				{/each}
			{/if}
		</li>
	{/each}
</ul>
<p>
	<u>Reloads:</u> These moves are used to reload for offensive moves. While most reloads can only be
	used for a specific move, note that the Ball Power reload is used for Fire Ball, Water Ball, and Ice
	Ball (but not Spiral Ball, which uses Spiral Energy). This makes Ball Power the most dynamic reload.
	Moreover, note that Fire Ball requires two Ball Power reloads while the other ball moves only require
	one, which is because Fire Ball also goes through Mirror. Lastly, observe that all of the reloads can
	be used for Death Smoke, which, as mentioned earlier, requires 10 reloads of any type.
</p>
<ul>
	{#each moves.filter((m) => m.method === 'reload') as move}
		<li>
			{move.title} (🔄 {move.icon})
			{#if move.method == 'reload' && move.for.length > 0}
				used for
				{#each move.for as usedFor}
					<span title={moves.find((m) => m.id === usedFor)?.title}>
						{moves.find((m) => m.id === usedFor)?.icon}
					</span>
				{/each}
			{/if}
		</li>
	{/each}
</ul>

<style>
	.title {
		color: black;
		text-decoration: none;
	}

	@media (prefers-color-scheme: dark) {
		.title {
			color: white;
		}
	}
</style>
